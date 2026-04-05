export enum CancellationCaseStatus {
  REQUESTED = "requested",
  EVALUATING_RETENTION = "evaluating_retention",
  RETENTION_OFFERED = "retention_offered",
  RETAINED = "retained",
  PAUSED = "paused",
  CANCELED = "canceled",
}

export enum CancellationReasonCategory {
  PRICE = "price",
  PRODUCT_FIT = "product_fit",
  DELIVERY = "delivery",
  BILLING = "billing",
  TEMPORARY_PAUSE = "temporary_pause",
  SWITCHED_COMPETITOR = "switched_competitor",
  OTHER = "other",
}

export enum CancellationFinalOutcome {
  RETAINED = "retained",
  PAUSED = "paused",
  CANCELED = "canceled",
}

export enum RetentionOfferType {
  PAUSE_OFFER = "pause_offer",
  DISCOUNT_OFFER = "discount_offer",
  BONUS_OFFER = "bonus_offer",
}

export enum RetentionOfferDecisionStatus {
  PROPOSED = "proposed",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  APPLIED = "applied",
  EXPIRED = "expired",
}

export type PauseOfferPayload = {
  pause_offer: {
    pause_cycles: number | null
    resume_at: string | null
    note: string | null
  }
}

export type DiscountOfferPayload = {
  discount_offer: {
    discount_type: "percentage" | "fixed"
    discount_value: number
    duration_cycles: number | null
    note: string | null
  }
}

export type BonusOfferPayload = {
  bonus_offer: {
    bonus_type: "free_cycle" | "gift" | "credit"
    value: number | null
    label: string | null
    duration_cycles: number | null
    note: string | null
  }
}

export type RetentionOfferPayload =
  | PauseOfferPayload
  | DiscountOfferPayload
  | BonusOfferPayload

export type CancellationCaseData = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: CancellationReasonCategory | null
  notes: string | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: string | null
  finalized_by: string | null
  cancellation_effective_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RetentionOfferEventData = {
  id: string
  cancellation_case_id: string
  offer_type: RetentionOfferType
  offer_payload: RetentionOfferPayload | null
  decision_status: RetentionOfferDecisionStatus
  decision_reason: string | null
  decided_at: string | null
  decided_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
