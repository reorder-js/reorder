export enum DunningCaseStatus {
  OPEN = "open",
  RETRY_SCHEDULED = "retry_scheduled",
  RETRYING = "retrying",
  AWAITING_MANUAL_RESOLUTION = "awaiting_manual_resolution",
  RECOVERED = "recovered",
  UNRECOVERED = "unrecovered",
}

export enum DunningAttemptStatus {
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export type DunningRetrySchedule = {
  strategy: "fixed_intervals"
  intervals: number[]
  timezone: "UTC"
  source: "default_policy" | "manual_override"
}

export type DunningCaseData = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: string | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: string | null
  recovered_at: string | null
  closed_at: string | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type DunningAttemptData = {
  id: string
  dunning_case_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: DunningAttemptStatus
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
