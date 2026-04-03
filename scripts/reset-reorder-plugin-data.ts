import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type TableSummary = {
  table: string
  deleted: number
}

async function deleteAllFromTable(
  pgConnection: {
    (tableName: string): {
      del(): Promise<number>
    }
  },
  tableName: string
) {
  return await pgConnection(tableName).del()
}

export default async function resetReorderPluginData({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  logger.warn(
    "[reset-reorder-plugin-data] Removing all persisted data owned by the reorder plugin. Core Medusa store data will be left untouched."
  )

  const summary: TableSummary[] = []

  summary.push({
    table: "subscription_log",
    deleted: await deleteAllFromTable(pgConnection, "subscription_log"),
  })
  summary.push({
    table: "subscription_metrics_daily",
    deleted: await deleteAllFromTable(pgConnection, "subscription_metrics_daily"),
  })
  summary.push({
    table: "retention_offer_event",
    deleted: await deleteAllFromTable(pgConnection, "retention_offer_event"),
  })
  summary.push({
    table: "dunning_attempt",
    deleted: await deleteAllFromTable(pgConnection, "dunning_attempt"),
  })
  summary.push({
    table: "renewal_attempt",
    deleted: await deleteAllFromTable(pgConnection, "renewal_attempt"),
  })
  summary.push({
    table: "cancellation_case",
    deleted: await deleteAllFromTable(pgConnection, "cancellation_case"),
  })
  summary.push({
    table: "dunning_case",
    deleted: await deleteAllFromTable(pgConnection, "dunning_case"),
  })
  summary.push({
    table: "renewal_cycle",
    deleted: await deleteAllFromTable(pgConnection, "renewal_cycle"),
  })
  summary.push({
    table: "subscription",
    deleted: await deleteAllFromTable(pgConnection, "subscription"),
  })
  summary.push({
    table: "subscription_settings",
    deleted: await deleteAllFromTable(pgConnection, "subscription_settings"),
  })
  summary.push({
    table: "plan_offer",
    deleted: await deleteAllFromTable(pgConnection, "plan_offer"),
  })

  const totalDeleted = summary.reduce((acc, row) => acc + row.deleted, 0)

  logger.info("[reset-reorder-plugin-data] Reset completed.")
  logger.info(
    `[reset-reorder-plugin-data] Removed ${totalDeleted} plugin rows across tables: ${summary
      .map((row) => `${row.table}=${row.deleted}`)
      .join(" ")}`
  )
}
