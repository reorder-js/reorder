import { randomUUID } from "crypto"

type LoggerLike = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type LogLevel = "info" | "warn" | "error"

export type RenewalFailureKind =
  | "already_processing"
  | "duplicate_execution"
  | "subscription_not_eligible"
  | "approval_blocked"
  | "offer_policy_blocked"
  | "order_creation_failed"
  | "unexpected_error"

type RenewalLogPayload = {
  event: string
  correlation_id: string
  renewal_cycle_id?: string
  subscription_id?: string
  trigger_type?: "scheduler" | "manual"
  triggered_by?: string | null
  attempt_no?: number
  duration_ms?: number
  success_count?: number
  failure_count?: number
  blocked_count?: number
  scanned_count?: number
  processed_count?: number
  batch_size?: number
  job_name?: string
  outcome?: "started" | "succeeded" | "failed" | "blocked" | "completed"
  failure_kind?: RenewalFailureKind
  alertable?: boolean
  message?: string
  metadata?: Record<string, unknown> | null
}

export function createRenewalCorrelationId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

export function classifyRenewalFailure(error: unknown): RenewalFailureKind {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  if (message.includes("already processing")) {
    return "already_processing"
  }

  if (message.includes("duplicate execution")) {
    return "duplicate_execution"
  }

  if (message.includes("isn't eligible for renewal")) {
    return "subscription_not_eligible"
  }

  if (message.includes("can't renew from status")) {
    return "subscription_not_eligible"
  }

  if (
    message.includes("requires approval") ||
    message.includes("requires approved changes")
  ) {
    return "approval_blocked"
  }

  if (
    message.includes("no active subscription offer") ||
    message.includes("frequency") && message.includes("not allowed")
  ) {
    return "offer_policy_blocked"
  }

  if (
    message.includes("renewal order creation failed") ||
    message.includes("missing 'cart_id'")
  ) {
    return "order_creation_failed"
  }

  return "unexpected_error"
}

export function isAlertableRenewalFailure(kind: RenewalFailureKind) {
  return !["already_processing", "duplicate_execution"].includes(kind)
}

export function getRenewalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Renewal processing failed"
}

export function logRenewalEvent(
  logger: LoggerLike,
  level: LogLevel,
  payload: RenewalLogPayload
) {
  const line = JSON.stringify({
    domain: "renewals",
    ...payload,
  })

  logger[level](line)
}
