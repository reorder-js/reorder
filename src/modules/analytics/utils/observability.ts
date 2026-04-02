import { randomUUID } from "crypto"

type LoggerLike = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type LogLevel = "info" | "warn" | "error"
type AnalyticsReadKind = "kpis" | "trends" | "export"

const SLOW_ANALYTICS_REBUILD_THRESHOLD_MS = 5_000
const SLOW_ANALYTICS_JOB_THRESHOLD_MS = 5_000
const SLOW_ANALYTICS_READ_THRESHOLD_MS = 1_000

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
  metrics_version?: string
  duration_ms?: number
  processed_days?: number
  processed_subscriptions?: number
  upserted_rows?: number
  blocked_count?: number
  failure_count?: number
  skipped_rows?: number
  failed_days?: string[]
  blocked_days?: string[]
  quality_issue_count?: number
  quality_error_count?: number
  quality_warning_count?: number
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

export function isSlowAnalyticsRebuild(durationMs: number) {
  return durationMs > SLOW_ANALYTICS_REBUILD_THRESHOLD_MS
}

export function isSlowAnalyticsJob(durationMs: number) {
  return durationMs > SLOW_ANALYTICS_JOB_THRESHOLD_MS
}

export function isSlowAnalyticsRead(durationMs: number) {
  return durationMs > SLOW_ANALYTICS_READ_THRESHOLD_MS
}

export function getAnalyticsRebuildLogLevel(input: {
  duration_ms: number
  failed_days_count: number
  blocked_days_count: number
  quality_error_count: number
  quality_warning_count: number
}): LogLevel {
  if (input.failed_days_count > 0 || input.quality_error_count > 0) {
    return "error"
  }

  if (
    input.blocked_days_count > 0 ||
    input.quality_warning_count > 0 ||
    isSlowAnalyticsRebuild(input.duration_ms)
  ) {
    return "warn"
  }

  return "info"
}

export function getAnalyticsJobLogLevel(input: {
  duration_ms: number
  failed_days_count: number
  blocked_days_count: number
}): LogLevel {
  if (input.failed_days_count > 0) {
    return "error"
  }

  if (
    input.blocked_days_count > 0 ||
    isSlowAnalyticsJob(input.duration_ms)
  ) {
    return "warn"
  }

  return "info"
}

export function getAnalyticsReadLogLevel(input: {
  duration_ms: number
  failed: boolean
}): LogLevel {
  if (input.failed) {
    return "error"
  }

  if (isSlowAnalyticsRead(input.duration_ms)) {
    return "warn"
  }

  return "info"
}

export function buildAnalyticsReadEventName(kind: AnalyticsReadKind) {
  return `analytics.read.${kind}`
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
