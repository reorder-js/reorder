export enum ActivityLogActorType {
  USER = "user",
  SYSTEM = "system",
  SCHEDULER = "scheduler",
}

export enum ActivityLogEventType {
  SUBSCRIPTION_PAUSED = "subscription.paused",
  SUBSCRIPTION_RESUMED = "subscription.resumed",
  SUBSCRIPTION_CANCELED = "subscription.canceled",
  SUBSCRIPTION_PLAN_CHANGE_SCHEDULED = "subscription.plan_change_scheduled",
  SUBSCRIPTION_SHIPPING_ADDRESS_UPDATED = "subscription.shipping_address_updated",
  RENEWAL_CYCLE_CREATED = "renewal.cycle_created",
  RENEWAL_APPROVAL_APPROVED = "renewal.approval_approved",
  RENEWAL_APPROVAL_REJECTED = "renewal.approval_rejected",
  RENEWAL_FORCE_REQUESTED = "renewal.force_requested",
  RENEWAL_SUCCEEDED = "renewal.succeeded",
  RENEWAL_FAILED = "renewal.failed",
  DUNNING_STARTED = "dunning.started",
  DUNNING_RETRY_EXECUTED = "dunning.retry_executed",
  DUNNING_RECOVERED = "dunning.recovered",
  DUNNING_UNRECOVERED = "dunning.unrecovered",
  DUNNING_RETRY_SCHEDULE_UPDATED = "dunning.retry_schedule_updated",
  CANCELLATION_CASE_STARTED = "cancellation.case_started",
  CANCELLATION_RECOMMENDATION_GENERATED = "cancellation.recommendation_generated",
  CANCELLATION_OFFER_APPLIED = "cancellation.offer_applied",
  CANCELLATION_REASON_UPDATED = "cancellation.reason_updated",
  CANCELLATION_FINALIZED = "cancellation.finalized",
}

export type ActivityLogChangedField = {
  field: string
  before: unknown
  after: unknown
}
