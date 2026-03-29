import { MedusaContainer } from "@medusajs/framework/types"
import {
  listDueRenewalCyclesForProcessing,
  type DueRenewalCycleRecord,
} from "../modules/renewal/utils/scheduler-query"
import { processRenewalCycleWorkflow } from "../workflows"

const JOB_NAME = "process-renewal-cycles"
const DEFAULT_BATCH_SIZE = 20

function getLogger(container: MedusaContainer) {
  return container.resolve("logger")
}

async function processCycle(
  container: MedusaContainer,
  logger: ReturnType<typeof getLogger>,
  cycle: DueRenewalCycleRecord
) {
  try {
    await processRenewalCycleWorkflow(container).run({
      input: {
        renewal_cycle_id: cycle.id,
        trigger_type: "scheduler",
      },
    })

    logger.info(
      `[${JOB_NAME}] processed renewal '${cycle.id}' for subscription '${cycle.subscription_id}'`
    )

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    logger.error(
      `[${JOB_NAME}] failed renewal '${cycle.id}' for subscription '${cycle.subscription_id}': ${message}`
    )

    return false
  }
}

export default async function processRenewalCyclesJob(
  container: MedusaContainer
) {
  const logger = getLogger(container)
  const startedAt = Date.now()
  const batchSize = DEFAULT_BATCH_SIZE

  logger.info(`[${JOB_NAME}] started with batch size ${batchSize}`)

  try {
    let offset = 0
    let page = 0
    let rawCount = 0
    let scanned = 0
    let processed = 0
    let succeeded = 0
    let failed = 0

    while (true) {
      const result = await listDueRenewalCyclesForProcessing(container, {
        limit: batchSize,
        offset,
      })

      if (page === 0) {
        rawCount = result.count
        logger.info(`[${JOB_NAME}] found ${rawCount} due renewal cycles`)
      }

      if (!result.cycles.length && result.offset + result.limit >= result.count) {
        break
      }

      if (result.cycles.length) {
        logger.info(
          `[${JOB_NAME}] processing batch ${page + 1} with ${result.cycles.length} eligible renewals`
        )
      }

      scanned += result.cycles.length

      for (const cycle of result.cycles) {
        processed += 1

        const ok = await processCycle(container, logger, cycle)

        if (ok) {
          succeeded += 1
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

    logger.info(
      `[${JOB_NAME}] completed in ${duration}ms; scanned=${scanned}, processed=${processed}, succeeded=${succeeded}, failed=${failed}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const duration = Date.now() - startedAt

    logger.error(
      `[${JOB_NAME}] failed after ${duration}ms: ${message}`
    )
  }
}

export const config = {
  name: JOB_NAME,
  schedule: "*/5 * * * *",
}
