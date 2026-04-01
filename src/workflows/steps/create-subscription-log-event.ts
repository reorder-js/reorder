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

async function findByDedupeKey(
  activityLogModule: ActivityLogModuleService,
  dedupeKey: string
) {
  const records = (await activityLogModule.listSubscriptionLogs({
    dedupe_key: dedupeKey,
  } as any)) as SubscriptionLogRecord[]

  return records[0] ?? null
}

export async function createSubscriptionLogEventStepHandler(
  input: CreateSubscriptionLogEventStepInput,
  { container }: { container: { resolve(key: string): unknown } }
) {
  const activityLogModule =
    container.resolve(ACTIVITY_LOG_MODULE) as ActivityLogModuleService

  const existing = await findByDedupeKey(
    activityLogModule,
    input.log_event.dedupe_key
  )

  if (existing) {
    return new StepResponse<
      SubscriptionLogRecord,
      CreateSubscriptionLogEventCompensation
    >(existing, {
      action: "existing",
    })
  }

  const created = (await activityLogModule.createSubscriptionLogs(
    input.log_event as any
  )) as SubscriptionLogRecord

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
