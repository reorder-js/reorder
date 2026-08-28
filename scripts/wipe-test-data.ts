import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function wipeTestData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  logger.warn(
    "[wipe-test-data] Wiping ALL transactional data (Orders, Carts, Customers, and Plugin Data) using TRUNCATE CASCADE..."
  )

  const tablesToTruncate = [
    // Core Medusa transactional tables
    "order",
    "cart",
    "customer",
    "payment",
    "payment_collection",
    "reservation_item",
    "fulfillment",
    
    // Reorder plugin tables
    "subscription",
    "plan_offer",
    "renewal_cycle",
    "dunning_case",
    "cancellation_case",
    "subscription_log",
    "subscription_metrics_daily",
    "retention_offer_event",
    "dunning_attempt",
    "renewal_attempt",
    "subscription_settings"
  ]

  // TRUNCATE with CASCADE deletes all rows from the specified tables and all tables that have foreign-key references to them.
  // We wrap table names in double quotes to preserve case/prevent reserved keyword conflicts.
  const query = `TRUNCATE TABLE ${tablesToTruncate.map(t => `"${t}"`).join(", ")} CASCADE;`
  
  try {
    await pgConnection.raw(query)
    logger.info(`[wipe-test-data] Successfully truncated tables: ${tablesToTruncate.join(", ")} and their dependent tables.`)
  } catch (error) {
    logger.error(`[wipe-test-data] Error truncating tables:`, error)
    throw error
  }

  logger.info("[wipe-test-data] Transactional data wipe completed successfully.")
}
