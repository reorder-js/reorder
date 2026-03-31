import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  classifyDunningFailure,
  createDunningCorrelationId,
  getDunningErrorMessage,
  isAlertableDunningFailure,
  logDunningEvent,
} from "../modules/dunning/utils/observability"
import {
  listDueDunningCasesForProcessing,
  type DueDunningCaseRecord,
} from "../modules/dunning/utils/scheduler-query"
import { runDunningRetryWorkflow } from "../workflows"

const JOB_NAME = "process-dunning-retries"
const JOB_LOCK_KEY = "jobs:dunning-retries"
const DEFAULT_BATCH_SIZE = 20

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

async function processCase(
  container: MedusaContainer,
  logger: ReturnType<typeof getLogger>,
  dunningCase: DueDunningCaseRecord,
  jobCorrelationId: string
) {
  const caseCorrelationId = `${jobCorrelationId}:${dunningCase.id}`
  const startedAt = Date.now()

  try {
    const { result } = await runDunningRetryWorkflow(container).run({
      input: {
        dunning_case_id: dunningCase.id,
        now: new Date(),
        correlation_id: caseCorrelationId,
      },
    })

    logDunningEvent(logger, "info", {
      event: "dunning.job.case",
      job_name: JOB_NAME,
      outcome: "succeeded",
      correlation_id: caseCorrelationId,
      dunning_case_id: dunningCase.id,
      subscription_id: dunningCase.subscription_id,
      renewal_cycle_id: dunningCase.renewal_cycle_id,
      attempt_no: dunningCase.attempt_count + 1,
      duration_ms: Date.now() - startedAt,
      success_count: 1,
      failure_count: 0,
      metadata: {
        retry_outcome: result.outcome,
      },
    })

    return {
      outcome: result.outcome,
      attempt_no: result.attempt_no,
      time_to_recover_ms: result.time_to_recover_ms ?? null,
    }
  } catch (error) {
    const message = getDunningErrorMessage(error)
    const failureKind = classifyDunningFailure(error)
    const level =
      failureKind === "already_retrying" ||
      failureKind === "not_due" ||
      failureKind === "closed_case" ||
      failureKind === "retry_exhausted"
        ? "warn"
        : "error"

    logDunningEvent(logger, level, {
      event: "dunning.job.case",
      job_name: JOB_NAME,
      outcome:
        failureKind === "already_retrying" ||
        failureKind === "not_due" ||
        failureKind === "closed_case" ||
        failureKind === "retry_exhausted"
          ? "blocked"
          : "failed",
      correlation_id: caseCorrelationId,
      dunning_case_id: dunningCase.id,
      subscription_id: dunningCase.subscription_id,
      renewal_cycle_id: dunningCase.renewal_cycle_id,
      attempt_no: dunningCase.attempt_count + 1,
      duration_ms: Date.now() - startedAt,
      success_count: 0,
      failure_count: 1,
      failure_kind: failureKind,
      alertable: isAlertableDunningFailure(failureKind),
      message,
    })

    return {
      outcome:
        failureKind === "already_retrying" ||
        failureKind === "not_due" ||
        failureKind === "closed_case" ||
        failureKind === "retry_exhausted" ||
        failureKind === "lock_timeout"
          ? ("blocked" as const)
          : ("failed" as const),
      attempt_no: dunningCase.attempt_count + 1,
      time_to_recover_ms: null,
    }
  }
}

async function runJob(container: MedusaContainer) {
  const logger = getLogger(container)
  const startedAt = Date.now()
  const batchSize = DEFAULT_BATCH_SIZE
  const jobCorrelationId = createDunningCorrelationId(JOB_NAME)

  logDunningEvent(logger, "info", {
    event: "dunning.job",
    job_name: JOB_NAME,
    outcome: "started",
    correlation_id: jobCorrelationId,
    batch_size: batchSize,
  })

  try {
    let rawCount = 0
    let page = 0
    let scanned = 0
    let processed = 0
    let recovered = 0
    let rescheduled = 0
    let unrecovered = 0
    let failed = 0
    let blocked = 0
    let attemptTotal = 0
    let recoveredTtrTotal = 0
    let recoveredTtrCount = 0

    while (true) {
      const result = await listDueDunningCasesForProcessing(container, {
        limit: batchSize,
      })

      if (page === 0) {
        rawCount = result.count

        logDunningEvent(logger, "info", {
          event: "dunning.job.discovery",
          job_name: JOB_NAME,
          outcome: "completed",
          correlation_id: jobCorrelationId,
          batch_size: batchSize,
          scanned_count: rawCount,
          message: "Discovered due dunning cases for scheduler processing",
        })
      }

      if (!result.cases.length) {
        break
      }

      logDunningEvent(logger, "info", {
        event: "dunning.job.batch",
        job_name: JOB_NAME,
        outcome: "started",
        correlation_id: jobCorrelationId,
        batch_size: result.cases.length,
        metadata: {
          page: page + 1,
        },
      })

      scanned += result.cases.length

      for (const dunningCase of result.cases) {
        processed += 1

        const result = await processCase(
          container,
          logger,
          dunningCase,
          jobCorrelationId
        )
        const outcome = result.outcome
        attemptTotal += result.attempt_no

        if (outcome === "recovered") {
          recovered += 1
          if (typeof result.time_to_recover_ms === "number") {
            recoveredTtrTotal += result.time_to_recover_ms
            recoveredTtrCount += 1
          }
        } else if (outcome === "retry_scheduled") {
          rescheduled += 1
        } else if (outcome === "unrecovered") {
          unrecovered += 1
        } else if (outcome === "blocked") {
          blocked += 1
        } else {
          failed += 1
        }
      }

      page += 1
    }

    logDunningEvent(logger, "info", {
      event: "dunning.job",
      job_name: JOB_NAME,
      outcome: "completed",
      correlation_id: jobCorrelationId,
      duration_ms: Date.now() - startedAt,
      batch_size: batchSize,
      scanned_count: scanned,
      processed_count: processed,
      recovered_count: recovered,
      rescheduled_count: rescheduled,
      unrecovered_count: unrecovered,
      failure_count: failed,
      blocked_count: blocked,
      avg_attempts: processed ? Number((attemptTotal / processed).toFixed(2)) : 0,
      recovery_rate: processed
        ? Number((recovered / processed).toFixed(4))
        : 0,
      fail_rate: processed
        ? Number(((failed + unrecovered) / processed).toFixed(4))
        : 0,
      avg_time_to_recover_ms: recoveredTtrCount
        ? Math.round(recoveredTtrTotal / recoveredTtrCount)
        : undefined,
      message: "Dunning scheduler completed",
      metadata: {
        raw_count: rawCount,
      },
    })
  } catch (error) {
    logDunningEvent(logger, "error", {
      event: "dunning.job",
      job_name: JOB_NAME,
      outcome: "failed",
      correlation_id: jobCorrelationId,
      duration_ms: Date.now() - startedAt,
      batch_size: batchSize,
      alertable: true,
      failure_kind: "unexpected_error",
      message: getDunningErrorMessage(error),
    })
  }
}

export default async function processDunningRetriesJob(
  container: MedusaContainer
) {
  const logger = getLogger(container)
  const locking = container.resolve<LockingService>(Modules.LOCKING)
  const jobCorrelationId = createDunningCorrelationId(`${JOB_NAME}-lock`)

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
    const message = getDunningErrorMessage(error)
    const blocked =
      message.toLowerCase().includes("timed-out acquiring lock") ||
      message.toLowerCase().includes("timeout")

    logDunningEvent(logger, blocked ? "warn" : "error", {
      event: "dunning.job",
      job_name: JOB_NAME,
      outcome: blocked ? "blocked" : "failed",
      correlation_id: jobCorrelationId,
      failure_kind: blocked ? "already_retrying" : "unexpected_error",
      alertable: !blocked,
      message: blocked
        ? "Dunning scheduler skipped because another job instance holds the lock"
        : message,
    })
  }
}

export const config = {
  name: JOB_NAME,
  schedule: "*/5 * * * *",
}
