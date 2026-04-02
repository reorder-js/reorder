import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ACTIVITY_LOG_MODULE,
} from "../../modules/activity-log"
import ActivityLogModuleService from "../../modules/activity-log/service"
import { NormalizedActivityLogEvent } from "../../modules/activity-log/utils/normalize-log-event"

type SubscriptionLogRecord = NormalizedActivityLogEvent & {
  id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type CreateSubscriptionLogEventStepInput = {
  log_event: NormalizedActivityLogEvent
}

type CreateSubscriptionLogEventCompensation =
  | {
      action: "created"
      subscription_log_id: string
    }
  | {
      action: "existing"
    }

function isDuplicateDedupeKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = "code" in error ? error.code : undefined
  const message = "message" in error ? error.message : undefined

  if (code === "23505") {
    return true
  }

  if (typeof message === "string" && message.includes("dedupe_key")) {
    return true
  }

  return false
}

export async function createSubscriptionLogEventStepHandler(
  input: CreateSubscriptionLogEventStepInput,
  { container }: { container: { resolve(key: string): unknown } }
) {
  const activityLogModule =
    container.resolve(ACTIVITY_LOG_MODULE) as ActivityLogModuleService

  let created: SubscriptionLogRecord

  try {
    created = (await activityLogModule.createSubscriptionLogs(
      input.log_event as any
    )) as SubscriptionLogRecord
  } catch (error) {
    if (!isDuplicateDedupeKeyError(error)) {
      throw error
    }

    return new StepResponse<
      SubscriptionLogRecord,
      CreateSubscriptionLogEventCompensation
    >(input.log_event as SubscriptionLogRecord, {
      action: "existing",
    })
  }

  return new StepResponse<
    SubscriptionLogRecord,
    CreateSubscriptionLogEventCompensation
  >(created, {
    action: "created",
    subscription_log_id: created.id,
  })
}

export async function compensateCreateSubscriptionLogEventStep(
  compensation: CreateSubscriptionLogEventCompensation,
  { container }: { container: { resolve(key: string): unknown } }
) {
  if (!compensation || compensation.action !== "created") {
    return
  }

  const activityLogModule =
    container.resolve(ACTIVITY_LOG_MODULE) as ActivityLogModuleService

  await activityLogModule.deleteSubscriptionLogs(compensation.subscription_log_id)
}

export const createSubscriptionLogEventStep = createStep(
  "create-subscription-log-event",
  createSubscriptionLogEventStepHandler,
  compensateCreateSubscriptionLogEventStep
)
