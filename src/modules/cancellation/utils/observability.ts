import { randomUUID } from "crypto"

type LoggerLike = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type LogLevel = "info" | "warn" | "error"

export type CancellationFailureKind =
  | "already_running"
  | "invalid_metrics_window"
  | "lock_timeout"
  | "unexpected_error"

type CancellationLogPayload = {
  event: string
  correlation_id: string
  duration_ms?: number
  batch_size?: number
  window_hours?: number
  case_count?: number
  terminal_case_count?: number
  canceled_count?: number
  retained_count?: number
  pause_count?: number
  churn_rate?: number
  offer_acceptance_rate?: number
  top_reason_categories?: Array<{
    reason_category: string
    count: number
  }>
  spike_reason_category?: string | null
  spike_current_count?: number
  spike_previous_count?: number
  threshold?: number
  job_name?: string
  outcome?: "started" | "completed" | "failed" | "blocked"
  failure_kind?: CancellationFailureKind
  alertable?: boolean
  message?: string
  metadata?: Record<string, unknown> | null
}

export function createCancellationCorrelationId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

export function getCancellationErrorMessage(error: unknown) {
  const direct = getNestedMessage(error)

  if (direct) {
    return direct
  }

  return "Cancellation operational processing failed"
}

export function classifyCancellationFailure(
  error: unknown
): CancellationFailureKind {
  const message = getCancellationErrorMessage(error).toLowerCase()

  if (
    message.includes("timed-out acquiring lock") ||
    message.includes("timeout acquiring lock") ||
    message.includes("timed out acquiring lock")
  ) {
    return "lock_timeout"
  }

  if (
    message.includes("already running") ||
    message.includes("another job instance")
  ) {
    return "already_running"
  }

  if (message.includes("window") && message.includes("invalid")) {
    return "invalid_metrics_window"
  }

  return "unexpected_error"
}

export function isAlertableCancellationFailure(kind: CancellationFailureKind) {
  return !["already_running", "lock_timeout"].includes(kind)
}

function getNestedMessage(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    return value
  }

  if (value instanceof Error) {
    const causeMessage = getNestedMessage((value as Error & { cause?: unknown }).cause)
    return value.message || causeMessage || null
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>

    const candidates = [
      record.message,
      record.error,
      record.details,
      record.cause,
      (record.response as Record<string, unknown> | undefined)?.data,
      (record.response as Record<string, unknown> | undefined)?.message,
      (record.data as Record<string, unknown> | undefined)?.message,
      (record.body as Record<string, unknown> | undefined)?.message,
    ]

    for (const candidate of candidates) {
      const nested = getNestedMessage(candidate)

      if (nested) {
        return nested
      }
    }
  }

  return null
}

export function logCancellationEvent(
  logger: LoggerLike,
  level: LogLevel,
  payload: CancellationLogPayload
) {
  const line = JSON.stringify({
    domain: "cancellation",
    ...payload,
  })

  logger[level](line)
}
