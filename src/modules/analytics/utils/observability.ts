import { randomUUID } from "crypto"

type LoggerLike = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type LogLevel = "info" | "warn" | "error"

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

export type AnalyticsFailureKind =
  | "already_running"
  | "lock_timeout"
  | "unexpected_error"

type AnalyticsLogPayload = {
  event: string
  correlation_id: string
  duration_ms?: number
  processed_days?: number
  processed_subscriptions?: number
  upserted_rows?: number
  blocked_count?: number
  failure_count?: number
  skipped_rows?: number
  failed_days?: string[]
  blocked_days?: string[]
  lookback_days?: number
  date_from?: string
  date_to?: string
  trigger_type?: "scheduled" | "incremental" | "manual"
  reason?: string | null
  job_name?: string
  outcome?: "started" | "completed" | "failed" | "blocked"
  failure_kind?: AnalyticsFailureKind
  alertable?: boolean
  message?: string
  metadata?: Record<string, unknown> | null
}

export function createAnalyticsCorrelationId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

export function getAnalyticsErrorMessage(error: unknown) {
  const direct = getNestedMessage(error)

  if (direct) {
    return direct
  }

  return "Analytics processing failed"
}

export function classifyAnalyticsFailure(error: unknown): AnalyticsFailureKind {
  const message = getAnalyticsErrorMessage(error).toLowerCase()

  if (
    message.includes("timed-out acquiring lock") ||
    message.includes("timeout acquiring lock") ||
    message.includes("timed out acquiring lock")
  ) {
    return "lock_timeout"
  }

  if (
    message.includes("already running") ||
    message.includes("already rebuilding") ||
    message.includes("another job instance")
  ) {
    return "already_running"
  }

  return "unexpected_error"
}

export function isAlertableAnalyticsFailure(kind: AnalyticsFailureKind) {
  return !["already_running", "lock_timeout"].includes(kind)
}

export function logAnalyticsEvent(
  logger: LoggerLike,
  level: LogLevel,
  payload: AnalyticsLogPayload
) {
  const line = JSON.stringify({
    domain: "analytics",
    ...payload,
  })

  logger[level](line)
}
