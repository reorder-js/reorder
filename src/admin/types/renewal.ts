export enum RenewalCycleAdminStatus {
  SCHEDULED = "scheduled",
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export enum RenewalAttemptAdminStatus {
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export enum RenewalApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export type RenewalAdminSubscriptionSummary = {
  subscription_id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  customer_name: string
  product_title: string
  variant_title: string
  sku: string | null
}

export type RenewalAdminOrderSummary = {
  order_id: string
  display_id: number | string
  status: string
}

export type RenewalAdminPendingChangeSummary = {
  variant_id: string
  variant_title: string
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  effective_at: string | null
}

export type RenewalAdminApprovalSummary = {
  status: RenewalApprovalStatus | null
  required: boolean
  decided_at: string | null
  decided_by: string | null
  reason: string | null
}

export type RenewalAttemptAdminRecord = {
  id: string
  attempt_no: number
  status: RenewalAttemptAdminStatus
  started_at: string
  finished_at: string | null
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  order_id: string | null
}

export type RenewalCycleAdminListItem = {
  id: string
  status: RenewalCycleAdminStatus
  subscription: RenewalAdminSubscriptionSummary
  scheduled_for: string
  last_attempt_status: RenewalAttemptAdminStatus | null
  last_attempt_at: string | null
  approval: RenewalAdminApprovalSummary
  generated_order: RenewalAdminOrderSummary | null
  updated_at: string
}

export type RenewalCycleAdminDetail = RenewalCycleAdminListItem & {
  created_at: string
  processed_at: string | null
  last_error: string | null
  pending_changes: RenewalAdminPendingChangeSummary | null
  attempts: RenewalAttemptAdminRecord[]
  metadata: Record<string, unknown> | null
}

export type RenewalCycleAdminListResponse = {
  renewals: RenewalCycleAdminListItem[]
  count: number
  limit: number
  offset: number
}

export type RenewalCycleAdminDetailResponse = {
  renewal: RenewalCycleAdminDetail
}

export type ForceRenewalAdminRequest = {
  reason?: string | null
}

export type ApproveRenewalChangesAdminRequest = {
  reason?: string | null
}

export type RejectRenewalChangesAdminRequest = {
  reason: string
}
