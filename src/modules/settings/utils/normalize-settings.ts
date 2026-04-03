import { MedusaError } from "@medusajs/framework/utils"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../types"

export type SubscriptionSettingsShape = {
  settings_key: string
  default_trial_days: number
  dunning_retry_intervals: number[]
  max_dunning_attempts: number
  default_renewal_behavior: SubscriptionRenewalBehavior
  default_cancellation_behavior: SubscriptionCancellationBehavior
  version: number
  updated_by: string | null
  updated_at: Date | null
  metadata: Record<string, unknown> | null
  is_persisted: boolean
}

export type UpdateSubscriptionSettingsInput = {
  default_trial_days?: number
  dunning_retry_intervals?: number[]
  max_dunning_attempts?: number
  default_renewal_behavior?: SubscriptionRenewalBehavior
  default_cancellation_behavior?: SubscriptionCancellationBehavior
  updated_by?: string | null
  metadata?: Record<string, unknown> | null
}

export const DEFAULT_SUBSCRIPTION_SETTINGS = {
  default_trial_days: 0,
  dunning_retry_intervals: [1440, 4320, 10080],
  max_dunning_attempts: 3,
  default_renewal_behavior:
    SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
  default_cancellation_behavior:
    SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
} as const

function assertInteger(value: number, field: string) {
  if (!Number.isInteger(value)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `'${field}' must be an integer`
    )
  }
}

function normalizeRetryIntervals(intervals: number[]) {
  if (!intervals.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "'dunning_retry_intervals' must contain at least one interval"
    )
  }

  const normalized = intervals.map((interval) => {
    assertInteger(interval, "dunning_retry_intervals")

    if (interval <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'dunning_retry_intervals' must contain positive values only"
      )
    }

    return interval
  })

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] <= normalized[index - 1]) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'dunning_retry_intervals' must be strictly increasing without duplicates"
      )
    }
  }

  return normalized
}

export function buildDefaultSubscriptionSettings() {
  return {
    settings_key: "global",
    default_trial_days: DEFAULT_SUBSCRIPTION_SETTINGS.default_trial_days,
    dunning_retry_intervals: [
      ...DEFAULT_SUBSCRIPTION_SETTINGS.dunning_retry_intervals,
    ],
    max_dunning_attempts: DEFAULT_SUBSCRIPTION_SETTINGS.max_dunning_attempts,
    default_renewal_behavior:
      DEFAULT_SUBSCRIPTION_SETTINGS.default_renewal_behavior,
    default_cancellation_behavior:
      DEFAULT_SUBSCRIPTION_SETTINGS.default_cancellation_behavior,
    version: 0,
    updated_by: null,
    updated_at: null,
    metadata: null,
    is_persisted: false,
  } satisfies SubscriptionSettingsShape
}

export function normalizeSubscriptionSettingsPayload(
  input: UpdateSubscriptionSettingsInput
) {
  const defaultTrialDays = input.default_trial_days
  const retryIntervals = input.dunning_retry_intervals
  const maxDunningAttempts = input.max_dunning_attempts

  if (defaultTrialDays !== undefined) {
    assertInteger(defaultTrialDays, "default_trial_days")

    if (defaultTrialDays < 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'default_trial_days' must be greater than or equal to 0"
      )
    }
  }

  const normalizedRetryIntervals =
    retryIntervals !== undefined
      ? normalizeRetryIntervals(retryIntervals)
      : undefined

  if (maxDunningAttempts !== undefined) {
    assertInteger(maxDunningAttempts, "max_dunning_attempts")

    if (maxDunningAttempts <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'max_dunning_attempts' must be greater than 0"
      )
    }
  }

  const effectiveRetryIntervals =
    normalizedRetryIntervals ??
    (retryIntervals === undefined ? undefined : normalizedRetryIntervals)

  if (
    maxDunningAttempts !== undefined &&
    effectiveRetryIntervals !== undefined &&
    maxDunningAttempts !== effectiveRetryIntervals.length
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "'max_dunning_attempts' must match the number of 'dunning_retry_intervals'"
    )
  }

  if (
    maxDunningAttempts === undefined &&
    effectiveRetryIntervals !== undefined &&
    input.max_dunning_attempts === undefined
  ) {
    return {
      ...input,
      dunning_retry_intervals: effectiveRetryIntervals,
      max_dunning_attempts: effectiveRetryIntervals.length,
      updated_by: input.updated_by ?? null,
      metadata: input.metadata ?? null,
    }
  }

  return {
    ...input,
    dunning_retry_intervals: effectiveRetryIntervals,
    updated_by: input.updated_by ?? null,
    metadata: input.metadata ?? null,
  }
}
