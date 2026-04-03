export enum SubscriptionRenewalBehavior {
  PROCESS_IMMEDIATELY = "process_immediately",
  REQUIRE_REVIEW_FOR_PENDING_CHANGES = "require_review_for_pending_changes",
}

export enum SubscriptionCancellationBehavior {
  RECOMMEND_RETENTION_FIRST = "recommend_retention_first",
  ALLOW_DIRECT_CANCELLATION = "allow_direct_cancellation",
}

export const GLOBAL_SUBSCRIPTION_SETTINGS_KEY = "global"
