import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  classifyCancellationFailure,
  createCancellationCorrelationId,
  getCancellationErrorMessage,
  isAlertableCancellationFailure,
  logCancellationEvent,
} from "../modules/cancellation/utils/observability"
import {
  isCancellationReasonSpikeAlertable,
  listCancellationOperationalMetrics,
} from "../modules/cancellation/utils/operational-metrics"

const JOB_NAME = "process-cancellation-operational-metrics"
const JOB_LOCK_KEY = "jobs:cancellation-operational-metrics"
const DEFAULT_WINDOW_HOURS = 24
const SPIKE_THRESHOLD = 5

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

async function runJob(container: MedusaContainer) {
  const logger = getLogger(container)
  const startedAt = Date.now()
  const correlationId = createCancellationCorrelationId(JOB_NAME)

  logCancellationEvent(logger, "info", {
    event: "cancellation.job",
    job_name: JOB_NAME,
    outcome: "started",
    correlation_id: correlationId,
    window_hours: DEFAULT_WINDOW_HOURS,
  })

  try {
    const metrics = await listCancellationOperationalMetrics(container, {
      window_hours: DEFAULT_WINDOW_HOURS,
    })
    const alertable = isCancellationReasonSpikeAlertable(metrics, SPIKE_THRESHOLD)

    logCancellationEvent(logger, alertable ? "warn" : "info", {
      event: "cancellation.job",
      job_name: JOB_NAME,
      outcome: "completed",
      correlation_id: correlationId,
      duration_ms: Date.now() - startedAt,
      window_hours: metrics.window_hours,
      case_count: metrics.case_count,
      terminal_case_count: metrics.terminal_case_count,
      canceled_count: metrics.canceled_count,
      retained_count: metrics.retained_count,
      pause_count: metrics.pause_count,
      churn_rate: metrics.churn_rate,
      offer_acceptance_rate: metrics.offer_acceptance_rate,
      top_reason_categories: metrics.top_reason_categories,
      spike_reason_category: metrics.spike_reason_category,
      spike_current_count: metrics.spike_current_count,
      spike_previous_count: metrics.spike_previous_count,
      threshold: SPIKE_THRESHOLD,
      alertable,
      message: alertable
        ? "Cancellation metrics detected an alertable churn spike"
        : "Cancellation operational metrics completed",
    })
  } catch (error) {
    const failureKind = classifyCancellationFailure(error)

    logCancellationEvent(
      logger,
      isAlertableCancellationFailure(failureKind) ? "error" : "warn",
      {
        event: "cancellation.job",
        job_name: JOB_NAME,
        outcome: failureKind === "lock_timeout" ? "blocked" : "failed",
        correlation_id: correlationId,
        duration_ms: Date.now() - startedAt,
        window_hours: DEFAULT_WINDOW_HOURS,
        failure_kind: failureKind,
        alertable: isAlertableCancellationFailure(failureKind),
        message: getCancellationErrorMessage(error),
      }
    )
  }
}

export default async function processCancellationOperationalMetricsJob(
  container: MedusaContainer
) {
  const logger = getLogger(container)
  const locking = container.resolve<LockingService>(Modules.LOCKING)
  const correlationId = createCancellationCorrelationId(`${JOB_NAME}-lock`)

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
    const failureKind = classifyCancellationFailure(error)
    const alertable = isAlertableCancellationFailure(failureKind)

    logCancellationEvent(logger, alertable ? "error" : "warn", {
      event: "cancellation.job",
      job_name: JOB_NAME,
      outcome: failureKind === "lock_timeout" ? "blocked" : "failed",
      correlation_id: correlationId,
      failure_kind: failureKind,
      alertable,
      message:
        failureKind === "lock_timeout"
          ? "Cancellation metrics job skipped because another job instance holds the lock"
          : getCancellationErrorMessage(error),
    })
  }
}

export const config = {
  name: JOB_NAME,
  schedule: "0 * * * *",
}
