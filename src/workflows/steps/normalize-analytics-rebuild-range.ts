import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type AnalyticsRebuildTriggerType =
  | "scheduled"
  | "incremental"
  | "manual"

export type RebuildAnalyticsDailySnapshotsStepInput = {
  date_from: string | Date
  date_to: string | Date
  trigger_type: AnalyticsRebuildTriggerType
  triggered_by?: string | null
  reason?: string | null
  correlation_id?: string | null
}

export type RebuildAnalyticsDailySnapshotsStepOutput = {
  date_from: string
  date_to: string
  normalized_days: string[]
  trigger_type: AnalyticsRebuildTriggerType
  triggered_by: string | null
  reason: string | null
  correlation_id: string
  processed_days: number
  processed_subscriptions: number
  upserted_rows: number
  skipped_rows: number
  blocked_days: string[]
  failed_days: string[]
}

function normalizeDateInput(value: string | Date, fieldName: "date_from" | "date_to") {
  const parsed = value instanceof Date ? new Date(value) : new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Analytics rebuild '${fieldName}' must be a valid date`)
  }

  return parsed
}

function toUtcDayStart(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function toUtcDayEnd(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

function enumerateUtcDays(from: Date, to: Date) {
  const days: string[] = []
  const current = new Date(from)

  while (current.getTime() <= to.getTime()) {
    days.push(current.toISOString())
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return days
}

function normalizeCorrelationId(
  triggerType: AnalyticsRebuildTriggerType,
  correlationId?: string | null
) {
  const trimmed = correlationId?.trim()

  if (trimmed) {
    return trimmed
  }

  return `analytics-rebuild:${triggerType}:${Date.now()}`
}

export const normalizeAnalyticsRebuildRangeStep = createStep(
  "normalize-analytics-rebuild-range",
  async function (input: RebuildAnalyticsDailySnapshotsStepInput) {
    const parsedFrom = normalizeDateInput(input.date_from, "date_from")
    const parsedTo = normalizeDateInput(input.date_to, "date_to")
    const normalizedFrom = toUtcDayStart(parsedFrom)
    const normalizedTo = toUtcDayEnd(parsedTo)

    if (normalizedFrom.getTime() > normalizedTo.getTime()) {
      throw new Error(
        "Analytics rebuild 'date_from' must be less than or equal to 'date_to'"
      )
    }

    const normalizedDays = enumerateUtcDays(
      normalizedFrom,
      toUtcDayStart(parsedTo)
    )

    return new StepResponse<RebuildAnalyticsDailySnapshotsStepOutput>({
      date_from: normalizedFrom.toISOString(),
      date_to: normalizedTo.toISOString(),
      normalized_days: normalizedDays,
      trigger_type: input.trigger_type,
      triggered_by: input.triggered_by ?? null,
      reason: input.reason ?? null,
      correlation_id: normalizeCorrelationId(
        input.trigger_type,
        input.correlation_id
      ),
      processed_days: normalizedDays.length,
      processed_subscriptions: 0,
      upserted_rows: 0,
      skipped_rows: 0,
      blocked_days: [],
      failed_days: [],
    })
  }
)
