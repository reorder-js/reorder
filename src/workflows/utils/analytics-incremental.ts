import { RebuildAnalyticsDailySnapshotsWorkflowInput } from "../rebuild-analytics-daily-snapshots"

type BuildAnalyticsIncrementalRebuildInput = {
  occurred_at?: Date | string | null
  trigger_source: "resume_subscription" | "finalize_cancellation" | "renewal_processed"
  correlation_id?: string | null
  triggered_by?: string | null
}

function toUtcDayStart(value: Date | string | null | undefined) {
  const parsed = value ? new Date(value) : new Date()

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  )
}

function toUtcDayEnd(dayStart: Date) {
  return new Date(
    Date.UTC(
      dayStart.getUTCFullYear(),
      dayStart.getUTCMonth(),
      dayStart.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

export function buildAnalyticsIncrementalRebuildInput(
  input: BuildAnalyticsIncrementalRebuildInput
): RebuildAnalyticsDailySnapshotsWorkflowInput {
  const dayStart = toUtcDayStart(input.occurred_at)

  return {
    date_from: dayStart,
    date_to: toUtcDayEnd(dayStart),
    trigger_type: "incremental",
    triggered_by: input.triggered_by ?? null,
    reason: input.trigger_source,
    correlation_id: input.correlation_id
      ? `${input.correlation_id}:analytics`
      : null,
  }
}
