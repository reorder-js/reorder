export type AdminSubscriptionRenewalBehavior =
  | "process_immediately"
  | "require_review_for_pending_changes"

export type AdminSubscriptionCancellationBehavior =
  | "recommend_retention_first"
  | "allow_direct_cancellation"

export type AdminSubscriptionSettings = {
  settings_key: string
  default_trial_days: number
  dunning_retry_intervals: number[]
  max_dunning_attempts: number
  default_renewal_behavior: AdminSubscriptionRenewalBehavior
  default_cancellation_behavior: AdminSubscriptionCancellationBehavior
  version: number
  updated_by: string | null
  updated_at: string | null
  metadata: Record<string, unknown> | null
  is_persisted: boolean
}

export type SubscriptionSettingsAdminResponse = {
  subscription_settings: AdminSubscriptionSettings
}

export type UpdateSubscriptionSettingsAdminBody = {
  default_trial_days: number
  dunning_retry_intervals: number[]
  max_dunning_attempts: number
  default_renewal_behavior: AdminSubscriptionRenewalBehavior
  default_cancellation_behavior: AdminSubscriptionCancellationBehavior
  expected_version: number
  reason?: string | null
}
