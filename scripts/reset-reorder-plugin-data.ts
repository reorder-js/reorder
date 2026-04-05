import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { RENEWAL_MODULE } from "../src/modules/renewal"
import { SUBSCRIPTION_MODULE } from "../src/modules/subscription"

type TableSummary = {
  table: string
  deleted: number
}

type QueryRecord = {
  id?: string | null
  customer_id?: string | null
  generated_order_id?: string | null
  metadata?: Record<string, unknown> | null
  subscription?: {
    id?: string | null
  } | null
  order?: {
    id?: string | null
  } | null
  customer?: {
    id?: string | null
  } | null
}

const SEED_NAMESPACE = "subscriptions-test-data"

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
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const customerModule = container.resolve<{
    deleteCustomers(ids: string[]): Promise<void>
  }>(Modules.CUSTOMER)
  const orderModule = container.resolve<{
    deleteOrders(ids: string[]): Promise<void>
  }>(Modules.ORDER)

  logger.warn(
    "[reset-reorder-plugin-data] Removing persisted data owned by the reorder plugin, including linked orders and customers."
  )

  const summary: TableSummary[] = []

  const subscriptions = (await pgConnection("subscription").select(
    "id",
    "customer_id"
  )) as QueryRecord[]

  const subscriptionIds =
    subscriptions.map((record) => record.id).filter((id): id is string => !!id)

  const customerIds = [
    ...new Set(
      subscriptions
        .map((record) => record.customer_id)
        .filter((id): id is string => !!id) ?? []
    ),
  ]

  const subscriptionOrderLinks = subscriptionIds.length
    ? (
        await query.graph({
          entity: "subscription_order",
          fields: ["subscription.id", "order.id"],
          filters: {
            subscription_id: subscriptionIds,
          },
        })
      ).data ?? []
    : []

  const subscriptionCustomerLinks = subscriptionIds.length
    ? (
        await query.graph({
          entity: "subscription_customer",
          fields: ["subscription.id", "customer.id"],
          filters: {
            subscription_id: subscriptionIds,
          },
        })
      ).data ?? []
    : []

  const renewalCycles = subscriptionIds.length
    ? ((await pgConnection("renewal_cycle")
        .select("id", "generated_order_id")
        .whereIn("subscription_id", subscriptionIds)) as QueryRecord[])
    : []

  const renewalOrderIds = (renewalCycles as QueryRecord[])
    .map((record) => record.generated_order_id)
    .filter((id): id is string => !!id)

  const orderIds = [
    ...new Set([
      ...(subscriptionOrderLinks as QueryRecord[])
        .map((record) => record.order?.id)
        .filter((id): id is string => !!id),
      ...renewalOrderIds,
      ...((await pgConnection("order")
        .select("id")
        .whereRaw("metadata->>'seed_namespace' = ?", [SEED_NAMESPACE])) as Array<{
        id?: string | null
      }>)
        .map((record) => record.id)
        .filter((id): id is string => !!id),
    ]),
  ]

  const seededCustomerIds = (
    (await pgConnection("customer")
      .select("id")
      .whereRaw("metadata->>'seed_namespace' = ?", [SEED_NAMESPACE])) as Array<{
      id?: string | null
    }>
  )
    .map((record) => record.id)
    .filter((id): id is string => !!id)

  const allCustomerIds = [...new Set([...customerIds, ...seededCustomerIds])]

  const subscriptionOrderLinkDefinitions = (subscriptionOrderLinks as QueryRecord[])
    .filter((record) => record.subscription?.id && record.order?.id)
    .map((record) => ({
      [SUBSCRIPTION_MODULE]: {
        subscription_id: record.subscription!.id!,
      },
      [Modules.ORDER]: {
        order_id: record.order!.id!,
      },
    }))

  const subscriptionCustomerLinkDefinitions = (
    subscriptionCustomerLinks as QueryRecord[]
  )
    .filter((record) => record.subscription?.id && record.customer?.id)
    .map((record) => ({
      [SUBSCRIPTION_MODULE]: {
        subscription_id: record.subscription!.id!,
      },
      [Modules.CUSTOMER]: {
        customer_id: record.customer!.id!,
      },
    }))

  const renewalOrderLinkDefinitions = (renewalCycles as QueryRecord[])
    .filter((record) => record.id && record.generated_order_id)
    .map((record) => ({
      [RENEWAL_MODULE]: {
        renewal_cycle_id: record.id!,
      },
      [Modules.ORDER]: {
        order_id: record.generated_order_id!,
      },
    }))

  if (renewalOrderLinkDefinitions.length) {
    await link.dismiss(renewalOrderLinkDefinitions)
  }

  if (subscriptionOrderLinkDefinitions.length) {
    await link.dismiss(subscriptionOrderLinkDefinitions)
  }

  if (subscriptionCustomerLinkDefinitions.length) {
    await link.dismiss(subscriptionCustomerLinkDefinitions)
  }

  if (orderIds.length) {
    await orderModule.deleteOrders(orderIds)
  }

  if (allCustomerIds.length) {
    await customerModule.deleteCustomers(allCustomerIds)
  }

  summary.push({
    table: "orders",
    deleted: orderIds.length,
  })
  summary.push({
    table: "customers",
    deleted: allCustomerIds.length,
  })

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
