import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import {
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../../modules/dunning/types"
import { dunningErrors } from "../../modules/dunning/utils/errors"
import {
  calculateNextRetryAt,
  validateDunningRetrySchedule,
} from "../../modules/dunning/utils/retry-schedule"
import { RENEWAL_MODULE } from "../../modules/renewal"
import type RenewalModuleService from "../../modules/renewal/service"
import { RenewalCycleStatus } from "../../modules/renewal/types"
import { renewalErrors } from "../../modules/renewal/utils/errors"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import type { SubscriptionSettingsShape } from "../../modules/settings/utils/normalize-settings"
import { getEffectiveSubscriptionSettings } from "../utils/subscription-settings"

const ACTIVE_DUNNING_CASE_STATUSES = new Set<DunningCaseStatus>([
  DunningCaseStatus.OPEN,
  DunningCaseStatus.RETRY_SCHEDULED,
  DunningCaseStatus.RETRYING,
  DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
])

const PAYMENT_FAILURE_SOURCES = new Set([
  "payment_provider",
  "payment_session",
  "payment_capture",
])

type SubscriptionRecord = {
  id: string
  status: SubscriptionStatus
  metadata: Record<string, unknown> | null
}

type RenewalCycleRecord = {
  id: string
  subscription_id: string
  status: RenewalCycleStatus
  generated_order_id: string | null
}

type DunningCaseRecord = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: Date | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: Date | null
  recovered_at: Date | null
  closed_at: Date | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
}

export type StartDunningStepInput = {
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id?: string | null
  payment_failure_source: "payment_provider" | "payment_session" | "payment_capture"
  payment_error_code?: string | null
  payment_error_message: string
  failed_at?: string | Date | null
  retry_schedule?: DunningRetrySchedule | null
  max_attempts?: number | null
  triggered_by?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

type StartDunningStepOutput = {
  action: "created" | "updated" | "noop"
  dunning_case_id: string
  subscription_id: string
  subscription_status: SubscriptionStatus
}

type StartDunningCompensation =
  | {
      action: "created"
      created_dunning_case_id: string
      previous_subscription: SubscriptionRecord | null
    }
  | {
      action: "updated"
      previous_dunning_case: DunningCaseRecord
      previous_subscription: SubscriptionRecord | null
    }
  | {
      action: "noop"
    }

function isActiveDunningCase(status: DunningCaseStatus) {
  return ACTIVE_DUNNING_CASE_STATUSES.has(status)
}

async function loadSubscription(
  container: { resolve(key: string): unknown },
  id: string
) {
  const subscriptionModule =
    container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService

  try {
    return (await subscriptionModule.retrieveSubscription(
      id
    )) as SubscriptionRecord
  } catch {
    throw subscriptionErrors.notFound("Subscription", id)
  }
}

async function loadRenewalCycle(
  container: { resolve(key: string): unknown },
  id: string
) {
  const renewalModule = container.resolve(RENEWAL_MODULE) as RenewalModuleService

  try {
    return (await renewalModule.retrieveRenewalCycle(id)) as RenewalCycleRecord
  } catch {
    throw renewalErrors.notFound("RenewalCycle", id)
  }
}

function normalizeFailureTime(failedAt?: string | Date | null) {
  if (!failedAt) {
    return new Date()
  }

  const normalized = failedAt instanceof Date ? failedAt : new Date(failedAt)

  if (Number.isNaN(normalized.getTime())) {
    throw dunningErrors.invalidData("Dunning failed_at must be a valid date")
  }

  return normalized
}

async function normalizeRetryPolicy(
  container: { resolve(key: string): unknown },
  input: StartDunningStepInput
) {
  const settings = await getEffectiveSubscriptionSettings(container)
  const schedule = input.retry_schedule ?? {
    strategy: "fixed_intervals" as const,
    intervals: [...settings.dunning_retry_intervals],
    timezone: "UTC" as const,
    source: "default_policy" as const,
  }
  const maxAttempts = input.max_attempts ?? settings.max_dunning_attempts

  try {
    validateDunningRetrySchedule(schedule, maxAttempts)
  } catch (error) {
    throw dunningErrors.invalidData(
      error instanceof Error ? error.message : "Invalid dunning retry schedule"
    )
  }

  return { schedule, maxAttempts, settings }
}

function baseDunningMetadata(input: StartDunningStepInput) {
  return {
    ...(input.metadata ?? {}),
    origin: "renewal_payment_failure",
    payment_failure_source: input.payment_failure_source,
    triggered_by: input.triggered_by ?? null,
    reason: input.reason ?? null,
  }
}

function createDunningMetadata(
  input: StartDunningStepInput,
  settings: SubscriptionSettingsShape
) {
  return {
    ...baseDunningMetadata(input),
    settings_policy: {
      dunning_retry_intervals: [...settings.dunning_retry_intervals],
      max_dunning_attempts: settings.max_dunning_attempts,
      settings_version: settings.version,
      is_persisted: settings.is_persisted,
    },
  }
}

function mergeDunningMetadata(
  existingMetadata: Record<string, unknown> | null,
  input: StartDunningStepInput
) {
  return {
    ...(existingMetadata ?? {}),
    ...baseDunningMetadata(input),
  }
}

export const startDunningStep = createStep(
  "start-dunning",
  async function (
    input: StartDunningStepInput,
    { container }
  ) {
    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    if (!PAYMENT_FAILURE_SOURCES.has(input.payment_failure_source)) {
      throw dunningErrors.invalidData(
        `Unsupported payment failure source '${input.payment_failure_source}'`
      )
    }

    if (!input.payment_error_message?.trim()) {
      throw dunningErrors.invalidData(
        "Dunning start requires a payment_error_message"
      )
    }

    const subscription = await loadSubscription(container, input.subscription_id)
    const cycle = await loadRenewalCycle(container, input.renewal_cycle_id)

    if (cycle.subscription_id !== subscription.id) {
      throw dunningErrors.invalidData(
        `RenewalCycle '${cycle.id}' doesn't belong to Subscription '${subscription.id}'`
      )
    }

    if (cycle.status !== RenewalCycleStatus.FAILED) {
      throw dunningErrors.conflict(
        `Dunning can only start from failed renewal cycles. Renewal '${cycle.id}' is '${cycle.status}'`
      )
    }

    if (
      subscription.status !== SubscriptionStatus.ACTIVE &&
      subscription.status !== SubscriptionStatus.PAST_DUE
    ) {
      throw subscriptionErrors.invalidState(
        subscription.id,
        "enter dunning",
        subscription.status
      )
    }

    const sameCycleCases = (await dunningModule.listDunningCases({
      renewal_cycle_id: cycle.id,
    } as any)) as DunningCaseRecord[]

    if (sameCycleCases.length > 1) {
      throw dunningErrors.conflict(
        `RenewalCycle '${cycle.id}' already has multiple dunning cases`
      )
    }

    const existingCase = sameCycleCases[0] ?? null

    const subscriptionCases = (await dunningModule.listDunningCases({
      subscription_id: subscription.id,
    } as any)) as DunningCaseRecord[]

    const activeCaseForSubscription = subscriptionCases.find(
      (dunningCase) =>
        dunningCase.id !== existingCase?.id &&
        isActiveDunningCase(dunningCase.status)
    )

    if (activeCaseForSubscription) {
      throw dunningErrors.duplicateActiveCaseBlocked(
        subscription.id,
        activeCaseForSubscription.id
      )
    }

    const { schedule, maxAttempts, settings } = await normalizeRetryPolicy(
      container,
      input
    )
    const failureTime = normalizeFailureTime(input.failed_at)
    const defaultNextRetryAt = calculateNextRetryAt(schedule, 0, failureTime)

    if (!defaultNextRetryAt) {
      throw dunningErrors.invalidData(
        "Dunning retry policy didn't produce an initial next_retry_at"
      )
    }

    const previousSubscription =
      subscription.status === SubscriptionStatus.PAST_DUE ? null : subscription

    if (!existingCase) {
      const created = (await dunningModule.createDunningCases({
        subscription_id: subscription.id,
        renewal_cycle_id: cycle.id,
        renewal_order_id: input.renewal_order_id ?? cycle.generated_order_id ?? null,
        status: DunningCaseStatus.RETRY_SCHEDULED,
        attempt_count: 0,
        max_attempts: maxAttempts,
        retry_schedule: schedule,
        next_retry_at: defaultNextRetryAt,
        last_payment_error_code: input.payment_error_code ?? null,
        last_payment_error_message: input.payment_error_message,
        last_attempt_at: null,
        recovered_at: null,
        closed_at: null,
        recovery_reason: null,
        metadata: createDunningMetadata(input, settings),
      } as any)) as DunningCaseRecord

      if (previousSubscription) {
        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          status: SubscriptionStatus.PAST_DUE,
        })
      }

      return new StepResponse<StartDunningStepOutput, StartDunningCompensation>(
        {
          action: "created",
          dunning_case_id: created.id,
          subscription_id: subscription.id,
          subscription_status: SubscriptionStatus.PAST_DUE,
        },
        {
          action: "created",
          created_dunning_case_id: created.id,
          previous_subscription: previousSubscription,
        }
      )
    }

    if (!isActiveDunningCase(existingCase.status)) {
      return new StepResponse<StartDunningStepOutput, StartDunningCompensation>(
        {
          action: "noop",
          dunning_case_id: existingCase.id,
          subscription_id: subscription.id,
          subscription_status: subscription.status,
        },
        {
          action: "noop",
        }
      )
    }

    const updated = (await dunningModule.updateDunningCases({
      id: existingCase.id,
      renewal_order_id:
        existingCase.renewal_order_id ??
        input.renewal_order_id ??
        cycle.generated_order_id ??
        null,
      status:
        existingCase.status === DunningCaseStatus.OPEN
          ? DunningCaseStatus.RETRY_SCHEDULED
          : existingCase.status,
      max_attempts: existingCase.max_attempts || maxAttempts,
      retry_schedule: existingCase.retry_schedule ?? schedule,
      next_retry_at: existingCase.next_retry_at ?? defaultNextRetryAt,
      last_payment_error_code:
        input.payment_error_code ?? existingCase.last_payment_error_code ?? null,
      last_payment_error_message: input.payment_error_message,
      metadata: mergeDunningMetadata(existingCase.metadata, input),
    } as any)) as DunningCaseRecord

    if (previousSubscription) {
      await subscriptionModule.updateSubscriptions({
        id: subscription.id,
        status: SubscriptionStatus.PAST_DUE,
      })
    }

    return new StepResponse<StartDunningStepOutput, StartDunningCompensation>(
      {
        action: "updated",
        dunning_case_id: updated.id,
        subscription_id: subscription.id,
        subscription_status: SubscriptionStatus.PAST_DUE,
      },
      {
        action: "updated",
        previous_dunning_case: existingCase,
        previous_subscription: previousSubscription,
      }
    )
  },
  async function (
    compensation: StartDunningCompensation,
    { container }
  ) {
    if (!compensation || compensation.action === "noop") {
      return
    }

    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    if (compensation.action === "created") {
      await dunningModule.deleteDunningCases(compensation.created_dunning_case_id)
    } else {
      await dunningModule.updateDunningCases(compensation.previous_dunning_case as any)
    }

    if (compensation.previous_subscription) {
      await subscriptionModule.updateSubscriptions(compensation.previous_subscription)
    }
  }
)
