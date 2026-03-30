import { randomUUID } from "crypto"

type LoggerLike = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type LogLevel = "info" | "warn" | "error"

export type DunningFailureKind =
  | "already_retrying"
  | "not_due"
  | "closed_case"
  | "invalid_transition"
  | "retry_exhausted"
  | "not_found"
  | "unexpected_error"

type DunningLogPayload = {
  event: string
  correlation_id: string
  dunning_case_id?: string
  subscription_id?: string
  renewal_cycle_id?: string
  attempt_no?: number
  duration_ms?: number
  success_count?: number
  failure_count?: number
  blocked_count?: number
  scanned_count?: number
  processed_count?: number
  recovered_count?: number
  rescheduled_count?: number
  unrecovered_count?: number
  batch_size?: number
  job_name?: string
  outcome?: "started" | "succeeded" | "failed" | "blocked" | "completed"
  failure_kind?: DunningFailureKind
  alertable?: boolean
  message?: string
  metadata?: Record<string, unknown> | null
}

export function createDunningCorrelationId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

export function getDunningErrorMessage(error: unknown) {
  const direct = getNestedMessage(error)

  if (direct) {
    return direct
  }

  return "Dunning processing failed"
}

export function classifyDunningFailure(error: unknown): DunningFailureKind {
  const message = getDunningErrorMessage(error).toLowerCase()

  if (message.includes("already retrying")) {
    return "already_retrying"
  }

  if (message.includes("not due for retry yet")) {
    return "not_due"
  }

  if (message.includes("already closed")) {
    return "closed_case"
  }

  if (message.includes("already exhausted retry attempts")) {
    return "retry_exhausted"
  }

  if (message.includes("was not found")) {
    return "not_found"
  }

  if (message.includes("can't") || message.includes("missing")) {
    return "invalid_transition"
  }

  return "unexpected_error"
}

export function isAlertableDunningFailure(kind: DunningFailureKind) {
  return ![
    "already_retrying",
    "not_due",
    "closed_case",
    "retry_exhausted",
  ].includes(kind)
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

export function logDunningEvent(
  logger: LoggerLike,
  level: LogLevel,
  payload: DunningLogPayload
) {
  const line = JSON.stringify({
    domain: "dunning",
    ...payload,
  })

  logger[level](line)
}
