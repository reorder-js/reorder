export enum RenewalCycleStatus {
  SCHEDULED = "scheduled",
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export enum RenewalAttemptStatus {
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export enum RenewalApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export type RenewalAppliedPendingUpdateData = {
  variant_id: string
  variant_title: string
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  effective_at: string | null
}
