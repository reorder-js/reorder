export enum CancellationCaseAdminStatus {
  REQUESTED = "requested",
  EVALUATING_RETENTION = "evaluating_retention",
  RETENTION_OFFERED = "retention_offered",
  RETAINED = "retained",
  PAUSED = "paused",
  CANCELED = "canceled",
}

export enum CancellationFinalOutcomeAdmin {
  RETAINED = "retained",
  PAUSED = "paused",
  CANCELED = "canceled",
}

export enum RetentionOfferDecisionAdminStatus {
  PROPOSED = "proposed",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  APPLIED = "applied",
  EXPIRED = "expired",
}

export type CancellationAdminSubscriptionSummary = {
  subscription_id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  customer_name: string
  product_title: string
  variant_title: string
  sku: string | null
  next_renewal_at: string | null
  last_renewal_at: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_effective_at: string | null
}

export type CancellationAdminDunningSummary = {
  dunning_case_id: string
  status:
    | "open"
    | "retry_scheduled"
    | "retrying"
    | "awaiting_manual_resolution"
    | "recovered"
    | "unrecovered"
  attempt_count: number
  next_retry_at: string | null
  last_payment_error_message: string | null
}

export type CancellationAdminRenewalSummary = {
  renewal_cycle_id: string
  status: "scheduled" | "processing" | "succeeded" | "failed"
  scheduled_for: string
  approval_status: "pending" | "approved" | "rejected" | null
  generated_order_id: string | null
}

export type CancellationAdminOfferEventRecord = {
  id: string
  offer_type: "pause_offer" | "discount_offer" | "bonus_offer"
  offer_payload: Record<string, unknown> | null
  decision_status: RetentionOfferDecisionAdminStatus
  decision_reason: string | null
  decided_at: string | null
  decided_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type CancellationCaseAdminListItem = {
  id: string
  status: CancellationCaseAdminStatus
  reason: string | null
  reason_category: string | null
  final_outcome: CancellationFinalOutcomeAdmin | null
  subscription: CancellationAdminSubscriptionSummary
  created_at: string
  finalized_at: string | null
  updated_at: string
}

export type CancellationCaseAdminDetail = CancellationCaseAdminListItem & {
  notes: string | null
  finalized_by: string | null
  cancellation_effective_at: string | null
  dunning: CancellationAdminDunningSummary | null
  renewal: CancellationAdminRenewalSummary | null
  offers: CancellationAdminOfferEventRecord[]
  metadata: Record<string, unknown> | null
}

export type CancellationCaseAdminListResponse = {
  cancellations: CancellationCaseAdminListItem[]
  count: number
  limit: number
  offset: number
}

export type CancellationCaseAdminDetailResponse = {
  cancellation: CancellationCaseAdminDetail
}

export type ApplyRetentionOfferAdminRequest =
  | {
      offer_type: "pause_offer"
      offer_payload: {
        pause_offer: {
          pause_cycles: number | null
          resume_at: string | null
          note: string | null
        }
      }
      decided_by?: string
      decision_reason?: string
      metadata?: Record<string, unknown>
    }
  | {
      offer_type: "discount_offer"
      offer_payload: {
        discount_offer: {
          discount_type: "percentage" | "fixed"
          discount_value: number
          duration_cycles: number | null
          note: string | null
        }
      }
      decided_by?: string
      decision_reason?: string
      metadata?: Record<string, unknown>
    }
  | {
      offer_type: "bonus_offer"
      offer_payload: {
        bonus_offer: {
          bonus_type: "free_cycle" | "gift" | "credit"
          value: number | null
          label: string | null
          duration_cycles: number | null
          note: string | null
        }
      }
      decided_by?: string
      decision_reason?: string
      metadata?: Record<string, unknown>
    }

export type FinalizeCancellationAdminRequest = {
  reason?: string
  reason_category?:
    | "price"
    | "product_fit"
    | "delivery"
    | "billing"
    | "temporary_pause"
    | "switched_competitor"
    | "other"
  notes?: string
  finalized_by?: string
  effective_at?: "immediately" | "end_of_cycle"
  metadata?: Record<string, unknown>
}

export type UpdateCancellationReasonAdminRequest = {
  reason: string
  reason_category?:
    | "price"
    | "product_fit"
    | "delivery"
    | "billing"
    | "temporary_pause"
    | "switched_competitor"
    | "other"
  notes?: string
  updated_by?: string
  update_reason?: string
  metadata?: Record<string, unknown>
}
