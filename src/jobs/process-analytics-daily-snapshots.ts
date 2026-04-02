import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  classifyAnalyticsFailure,
  createAnalyticsCorrelationId,
  getAnalyticsErrorMessage,
  isAlertableAnalyticsFailure,
  logAnalyticsEvent,
} from "../modules/analytics/utils/observability"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "../workflows"

const JOB_NAME = "process-analytics-daily-snapshots"
const JOB_LOCK_KEY = "jobs:analytics-daily-snapshots"
const DEFAULT_LOOKBACK_DAYS = 3

type LockingService = {
  execute<T>(
    keys: string | string[],
    job: () => Promise<T>,
    args?: {
      timeout?: number
      provider?: string
    }
  ): Promise<T>
}

function getLogger(container: MedusaContainer) {
  return container.resolve("logger")
}

function getUtcDayStart(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function getUtcDayEnd(date: Date) {
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

function resolveScheduledWindow(lookbackDays: number) {
  const today = new Date()
  const todayStart = getUtcDayStart(today)
  const from = new Date(todayStart)
  from.setUTCDate(from.getUTCDate() - Math.max(lookbackDays - 1, 0))

  return {
    date_from: from,
    date_to: getUtcDayEnd(today),
  }
}

async function runJob(container: MedusaContainer) {
  const logger = getLogger(container)
  const startedAt = Date.now()
  const correlationId = createAnalyticsCorrelationId(JOB_NAME)
  const window = resolveScheduledWindow(DEFAULT_LOOKBACK_DAYS)

  logAnalyticsEvent(logger, "info", {
    event: "analytics.job",
    job_name: JOB_NAME,
    outcome: "started",
    correlation_id: correlationId,
    trigger_type: "scheduled",
    lookback_days: DEFAULT_LOOKBACK_DAYS,
    date_from: window.date_from.toISOString(),
    date_to: window.date_to.toISOString(),
  })

  try {
    const { result } = await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
      input: {
        date_from: window.date_from,
        date_to: window.date_to,
        trigger_type: "scheduled",
        reason: `daily scheduled rebuild with ${DEFAULT_LOOKBACK_DAYS}-day lookback`,
        correlation_id: correlationId,
      },
    })

    logAnalyticsEvent(logger, result.blocked_days.length ? "warn" : "info", {
      event: "analytics.job",
      job_name: JOB_NAME,
      outcome: "completed",
      correlation_id: correlationId,
      trigger_type: "scheduled",
      duration_ms: Date.now() - startedAt,
      lookback_days: DEFAULT_LOOKBACK_DAYS,
      date_from: result.date_from,
      date_to: result.date_to,
      processed_days: result.processed_days,
      processed_subscriptions: result.processed_subscriptions,
      upserted_rows: result.upserted_rows,
      blocked_count: result.blocked_days.length,
      failure_count: result.failed_days.length,
      skipped_rows: result.skipped_rows,
      alertable: result.failed_days.length > 0,
      message:
        result.failed_days.length > 0
          ? "Analytics daily snapshots completed with failures"
          : result.blocked_days.length > 0
            ? "Analytics daily snapshots completed with blocked days"
            : "Analytics daily snapshots completed",
      metadata: {
        blocked_days: result.blocked_days,
        failed_days: result.failed_days,
      },
    })
  } catch (error) {
    const failureKind = classifyAnalyticsFailure(error)

    logAnalyticsEvent(
      logger,
      isAlertableAnalyticsFailure(failureKind) ? "error" : "warn",
      {
        event: "analytics.job",
        job_name: JOB_NAME,
        outcome: failureKind === "lock_timeout" ? "blocked" : "failed",
        correlation_id: correlationId,
        trigger_type: "scheduled",
        duration_ms: Date.now() - startedAt,
        lookback_days: DEFAULT_LOOKBACK_DAYS,
        date_from: window.date_from.toISOString(),
        date_to: window.date_to.toISOString(),
        failure_kind: failureKind,
        alertable: isAlertableAnalyticsFailure(failureKind),
        message: getAnalyticsErrorMessage(error),
      }
    )
  }
}

export default async function processAnalyticsDailySnapshotsJob(
  container: MedusaContainer
) {
  const logger = getLogger(container)
  const locking = container.resolve<LockingService>(Modules.LOCKING)
  const correlationId = createAnalyticsCorrelationId(`${JOB_NAME}-lock`)

  try {
    await locking.execute(
      JOB_LOCK_KEY,
      async () => {
        await runJob(container)
      },
      {
        timeout: 1,
      }
    )
  } catch (error) {
    const failureKind = classifyAnalyticsFailure(error)
    const alertable = isAlertableAnalyticsFailure(failureKind)

    logAnalyticsEvent(logger, alertable ? "error" : "warn", {
      event: "analytics.job",
      job_name: JOB_NAME,
      outcome: failureKind === "lock_timeout" ? "blocked" : "failed",
      correlation_id: correlationId,
      failure_kind: failureKind,
      alertable,
      message:
        failureKind === "lock_timeout"
          ? "Analytics daily snapshots job skipped because another job instance holds the lock"
          : getAnalyticsErrorMessage(error),
    })
  }
}

export const config = {
  name: JOB_NAME,
  schedule: "0 0 * * *",
}
