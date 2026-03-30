import { MedusaContainer } from "@medusajs/framework/types"
import {
  listDueRenewalCyclesForProcessing,
  type DueRenewalCycleRecord,
} from "../modules/renewal/utils/scheduler-query"
import {
  classifyRenewalFailure,
  createRenewalCorrelationId,
  getRenewalErrorMessage,
  isAlertableRenewalFailure,
  logRenewalEvent,
} from "../modules/renewal/utils/observability"
import { processRenewalCycleWorkflow } from "../workflows"

const JOB_NAME = "process-renewal-cycles"
const DEFAULT_BATCH_SIZE = 20

function getLogger(container: MedusaContainer) {
  return container.resolve("logger")
}

async function processCycle(
  container: MedusaContainer,
  logger: ReturnType<typeof getLogger>,
  cycle: DueRenewalCycleRecord,
  jobCorrelationId: string
) {
  const cycleCorrelationId = `${jobCorrelationId}:${cycle.id}`
  const startedAt = Date.now()

  try {
    await processRenewalCycleWorkflow(container).run({
      input: {
        renewal_cycle_id: cycle.id,
        trigger_type: "scheduler",
        correlation_id: cycleCorrelationId,
      },
    })

    logRenewalEvent(logger, "info", {
      event: "renewal.job.cycle",
      job_name: JOB_NAME,
      outcome: "succeeded",
      correlation_id: cycleCorrelationId,
      renewal_cycle_id: cycle.id,
      subscription_id: cycle.subscription_id,
      trigger_type: "scheduler",
      duration_ms: Date.now() - startedAt,
      success_count: 1,
      failure_count: 0,
    })

    return "succeeded" as const
  } catch (error) {
    const message = getRenewalErrorMessage(error)
    const failureKind = classifyRenewalFailure(error)
    const level =
      failureKind === "already_processing" || failureKind === "duplicate_execution"
        ? "warn"
        : "error"

    logRenewalEvent(logger, level, {
      event: "renewal.job.cycle",
      job_name: JOB_NAME,
      outcome:
        failureKind === "already_processing" || failureKind === "duplicate_execution"
          ? "blocked"
          : "failed",
      correlation_id: cycleCorrelationId,
      renewal_cycle_id: cycle.id,
      subscription_id: cycle.subscription_id,
      trigger_type: "scheduler",
      duration_ms: Date.now() - startedAt,
      success_count: 0,
      failure_count: 1,
      failure_kind: failureKind,
      alertable: isAlertableRenewalFailure(failureKind),
      message,
    })

    return failureKind === "already_processing" ||
      failureKind === "duplicate_execution"
      ? ("blocked" as const)
      : ("failed" as const)
  }
}

export default async function processRenewalCyclesJob(
  container: MedusaContainer
) {
  const logger = getLogger(container)
  const startedAt = Date.now()
  const batchSize = DEFAULT_BATCH_SIZE
  const jobCorrelationId = createRenewalCorrelationId(JOB_NAME)

  logRenewalEvent(logger, "info", {
    event: "renewal.job",
    job_name: JOB_NAME,
    outcome: "started",
    correlation_id: jobCorrelationId,
    batch_size: batchSize,
  })

  try {
    let offset = 0
    let page = 0
    let rawCount = 0
    let scanned = 0
    let processed = 0
    let succeeded = 0
    let failed = 0
    let blocked = 0

    while (true) {
      const result = await listDueRenewalCyclesForProcessing(container, {
        limit: batchSize,
        offset,
      })

      if (page === 0) {
        rawCount = result.count
        logRenewalEvent(logger, "info", {
          event: "renewal.job.discovery",
          job_name: JOB_NAME,
          outcome: "completed",
          correlation_id: jobCorrelationId,
          batch_size: batchSize,
          scanned_count: rawCount,
          message: "Discovered due renewal cycles for scheduler processing",
        })
      }

      if (!result.cycles.length && result.offset + result.limit >= result.count) {
        break
      }

      if (result.cycles.length) {
        logRenewalEvent(logger, "info", {
          event: "renewal.job.batch",
          job_name: JOB_NAME,
          outcome: "started",
          correlation_id: jobCorrelationId,
          batch_size: result.cycles.length,
          metadata: {
            page: page + 1,
            offset: result.offset,
          },
        })
      }

      scanned += result.cycles.length

      for (const cycle of result.cycles) {
        processed += 1

        const outcome = await processCycle(
          container,
          logger,
          cycle,
          jobCorrelationId
        )

        if (outcome === "succeeded") {
          succeeded += 1
        } else if (outcome === "blocked") {
          blocked += 1
        } else {
          failed += 1
        }
      }

      page += 1
      offset += result.limit

      if (offset >= result.count) {
        break
      }
    }

    const duration = Date.now() - startedAt

    logRenewalEvent(logger, "info", {
      event: "renewal.job",
      job_name: JOB_NAME,
      outcome: "completed",
      correlation_id: jobCorrelationId,
      duration_ms: duration,
      batch_size: batchSize,
      scanned_count: scanned,
      processed_count: processed,
      success_count: succeeded,
      failure_count: failed,
      blocked_count: blocked,
      message: "Renewal scheduler completed",
      metadata: {
        raw_count: rawCount,
      },
    })
  } catch (error) {
    const message = getRenewalErrorMessage(error)
    const duration = Date.now() - startedAt

    logRenewalEvent(logger, "error", {
      event: "renewal.job",
      job_name: JOB_NAME,
      outcome: "failed",
      correlation_id: jobCorrelationId,
      duration_ms: duration,
      batch_size: batchSize,
      alertable: true,
      failure_kind: "unexpected_error",
      message,
    })
  }
}

export const config = {
  name: JOB_NAME,
  schedule: "*/5 * * * *",
}
