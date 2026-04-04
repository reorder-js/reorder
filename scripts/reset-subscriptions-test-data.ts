import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { RENEWAL_MODULE } from "../src/modules/renewal"
import { SUBSCRIPTION_MODULE } from "../src/modules/subscription"

const SEED_NAMESPACE = "subscriptions-test-data"

const IDS = {
  settings: [
    "set_seed_subscriptions_global",
  ],
  planOffers: [
    "po_seed_subscriptions_success",
    "po_seed_subscriptions_blocked",
  ],
  subscriptions: [
    "sub_seed_subscriptions_success",
    "sub_seed_subscriptions_paused",
    "sub_seed_subscriptions_cancel_effective",
    "sub_seed_subscriptions_approval_pending",
    "sub_seed_subscriptions_policy_blocked",
    "sub_seed_subscriptions_failed_history",
    "sub_seed_dunning_retry_scheduled",
    "sub_seed_dunning_awaiting_manual",
    "sub_seed_dunning_recovered",
    "sub_seed_dunning_unrecovered",
    "sub_seed_dunning_manual_override",
    "sub_seed_analytics_bimonthly",
  ],
  renewalCycles: [
    "re_seed_subscriptions_success",
    "re_seed_subscriptions_paused",
    "re_seed_subscriptions_cancel_effective",
    "re_seed_subscriptions_approval_pending",
    "re_seed_subscriptions_policy_blocked",
    "re_seed_subscriptions_failed_history",
    "re_seed_dunning_retry_scheduled",
    "re_seed_dunning_awaiting_manual",
    "re_seed_dunning_recovered",
    "re_seed_dunning_unrecovered",
    "re_seed_dunning_manual_override",
  ],
  renewalAttempts: [
    "rea_seed_subscriptions_failed_history",
  ],
  dunningCases: [
    "dc_seed_dunning_retry_scheduled",
    "dc_seed_dunning_awaiting_manual",
    "dc_seed_dunning_recovered",
    "dc_seed_dunning_unrecovered",
    "dc_seed_dunning_manual_override",
  ],
  dunningAttempts: [
    "da_seed_dunning_awaiting_manual_1",
    "da_seed_dunning_recovered_1",
    "da_seed_dunning_recovered_2",
    "da_seed_dunning_unrecovered_1",
    "da_seed_dunning_unrecovered_2",
    "da_seed_dunning_unrecovered_3",
    "da_seed_dunning_manual_override_1",
  ],
  cancellationCases: [
    "cc_seed_cancellation_open_billing",
    "cc_seed_cancellation_retained_discount",
    "cc_seed_cancellation_paused",
    "cc_seed_cancellation_canceled_immediate",
    "cc_seed_cancellation_canceled_end_cycle",
    "cc_seed_cancellation_open_price",
    "cc_seed_cancellation_open_paused",
  ],
  retentionOfferEvents: [
    "roe_seed_cancellation_discount_retained",
    "roe_seed_cancellation_pause_applied",
  ],
  subscriptionLogs: [
    "slog_seed_subscription_paused",
    "slog_seed_renewal_succeeded",
    "slog_seed_dunning_recovered",
  ],
  customerReferences: [
    "SUB-QA-REN-SUCCESS",
    "SUB-QA-REN-PAUSED",
    "SUB-QA-REN-CANCEL-EFFECTIVE",
    "SUB-QA-REN-APPROVAL-PENDING",
    "SUB-QA-REN-POLICY-BLOCKED",
    "SUB-QA-REN-FAILED-HISTORY",
    "SUB-QA-DUN-RETRY-SCHEDULED",
    "SUB-QA-DUN-AWAITING-MANUAL",
    "SUB-QA-DUN-RECOVERED",
    "SUB-QA-DUN-UNRECOVERED",
    "SUB-QA-DUN-MANUAL-OVERRIDE",
    "SUB-QA-CAN-OPEN-BILLING",
    "SUB-QA-CAN-RETAINED-DISCOUNT",
    "SUB-QA-CAN-PAUSED",
    "SUB-QA-CAN-CANCELED-IMMEDIATE",
    "SUB-QA-CAN-CANCELED-END-CYCLE",
    "SUB-QA-CAN-OPEN-PRICE",
    "SUB-QA-CAN-OPEN-PAUSED-SUB",
    "SUB-QA-ANL-BI-MONTHLY",
  ],
} as const

type QueryRecord = {
  id: string
  metadata?: Record<string, unknown> | null
}

type SubscriptionOrderLinkRecord = {
  subscription?: {
    id?: string | null
  } | null
  order?: {
    id?: string | null
    metadata?: Record<string, unknown> | null
  } | null
}

type RenewalCycleOrderRecord = {
  id: string
  generated_order_id?: string | null
}

function hasSeedNamespace(record: QueryRecord) {
  return record.metadata?.seed_namespace === SEED_NAMESPACE
}

async function listSeedRecordIds(
  query: {
    graph(input: Record<string, unknown>): Promise<{ data: QueryRecord[] }>
  },
  entity: string,
  ids: string[]
) {
  if (!ids.length) {
    return []
  }

  const { data } = await query.graph({
    entity,
    fields: ["id", "metadata"],
    filters: {
      id: ids,
    },
  })

  return (data ?? [])
    .filter((record) => ids.includes(record.id))
    .filter(hasSeedNamespace)
    .map((record) => record.id)
}

async function deleteFromTable(
  pgConnection: {
    (tableName: string): {
      whereIn(column: string, values: string[]): {
        del(): Promise<number>
      }
    }
  },
  tableName: string,
  ids: string[]
) {
  if (!ids.length) {
    return 0
  }

  return await pgConnection(tableName).whereIn("id", ids).del()
}

async function deleteFromTableByColumn(
  pgConnection: {
    (tableName: string): {
      whereIn(column: string, values: string[]): {
        del(): Promise<number>
      }
    }
  },
  tableName: string,
  column: string,
  ids: string[]
) {
  if (!ids.length) {
    return 0
  }

  return await pgConnection(tableName).whereIn(column, ids).del()
}

export default async function resetSubscriptionsTestData({
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

  logger.info("[subscriptions-test-data-reset] Resolving seeded records")

  const settingsIds = await listSeedRecordIds(query, "subscription_settings", [
    ...IDS.settings,
  ])
  const planOfferIds = await listSeedRecordIds(query, "plan_offer", [
    ...IDS.planOffers,
  ])
  const subscriptionIds = await listSeedRecordIds(query, "subscription", [
    ...IDS.subscriptions,
  ])
  const renewalCycleIds = await listSeedRecordIds(query, "renewal_cycle", [
    ...IDS.renewalCycles,
  ])
  const renewalAttemptIds = await listSeedRecordIds(query, "renewal_attempt", [
    ...IDS.renewalAttempts,
  ])
  const dunningCaseIds = await listSeedRecordIds(query, "dunning_case", [
    ...IDS.dunningCases,
  ])
  const dunningAttemptIds = await listSeedRecordIds(query, "dunning_attempt", [
    ...IDS.dunningAttempts,
  ])
  const cancellationCaseIds = await listSeedRecordIds(query, "cancellation_case", [
    ...IDS.cancellationCases,
  ])
  const retentionOfferEventIds = await listSeedRecordIds(
    query,
    "retention_offer_event",
    [...IDS.retentionOfferEvents]
  )
  const subscriptionLogIds = await listSeedRecordIds(query, "subscription_log", [
    ...IDS.subscriptionLogs,
  ])
  const analyticsSnapshotIds = subscriptionIds.length
    ? (
        await query.graph({
          entity: "subscription_metrics_daily",
          fields: ["id", "metadata"],
          filters: {
            subscription_id: subscriptionIds,
          },
        })
      ).data
        ?.filter((record) => hasSeedNamespace(record as QueryRecord))
        .map((record) => (record as QueryRecord).id) ?? []
    : []
  const seededCustomerEmails = IDS.customerReferences.map(
    (reference) => `${reference.toLowerCase()}@example.com`
  )
  const seededCustomerIds = (
    await query.graph({
      entity: "customer",
      fields: ["id", "metadata", "email"],
      filters: {
        email: seededCustomerEmails,
      },
    })
  ).data
    ?.filter((record) => hasSeedNamespace(record as QueryRecord))
    .map((record) => (record as QueryRecord).id) ?? []

  const subscriptionOrderLinks = subscriptionIds.length
    ? (
        await query.graph({
          entity: "subscription_order",
          fields: ["subscription.id", "order.id", "order.metadata"],
          filters: {
            subscription_id: subscriptionIds,
          },
        })
      ).data ?? []
    : []

  const renewalCycles = renewalCycleIds.length
    ? (
        await query.graph({
          entity: "renewal_cycle",
          fields: ["id", "generated_order_id"],
          filters: {
            id: renewalCycleIds,
          },
        })
      ).data ?? []
    : []

  const renewalOrderIds = (renewalCycles as RenewalCycleOrderRecord[])
    .map((record) => record.generated_order_id)
    .filter((id): id is string => !!id)

  const renewalOrders = renewalOrderIds.length
    ? (
        await query.graph({
          entity: "order",
          fields: ["id", "metadata"],
          filters: {
            id: renewalOrderIds,
          },
        })
      ).data ?? []
    : []

  const subscriptionOrderLinkDefinitions = (
    subscriptionOrderLinks as SubscriptionOrderLinkRecord[]
  )
    .filter((record) => record.subscription?.id && record.order?.id)
    .map((record) => ({
      [SUBSCRIPTION_MODULE]: {
        subscription_id: record.subscription!.id!,
      },
      [Modules.ORDER]: {
        order_id: record.order!.id!,
      },
    }))

  const renewalOrderLinkDefinitions = (renewalCycles as RenewalCycleOrderRecord[])
    .filter((record) => record.id && record.generated_order_id)
    .map((record) => ({
      [RENEWAL_MODULE]: {
        renewal_cycle_id: record.id,
      },
      [Modules.ORDER]: {
        order_id: record.generated_order_id!,
      },
    }))

  const seededOrderIds = [
    ...new Set(
      [
        ...(subscriptionOrderLinks as SubscriptionOrderLinkRecord[]).map(
          (record) => record.order
        ),
        ...(renewalOrders as Array<QueryRecord | null | undefined>),
      ]
        .filter(
          (order): order is {
            id?: string | null
            metadata?: Record<string, unknown> | null
          } => !!order
        )
        .filter((order) => order.metadata?.seed_namespace === SEED_NAMESPACE)
        .map((order) => order.id)
        .filter((id): id is string => !!id)
    ),
  ]

  if (renewalOrderLinkDefinitions.length) {
    await link.dismiss(renewalOrderLinkDefinitions)
  }

  if (subscriptionOrderLinkDefinitions.length) {
    await link.dismiss(subscriptionOrderLinkDefinitions)
  }

  if (seededOrderIds.length) {
    await orderModule.deleteOrders(seededOrderIds)
  }

  const deletedSubscriptionLogs = await deleteFromTable(
    pgConnection,
    "subscription_log",
    subscriptionLogIds
  )
  const deletedSettings = await deleteFromTable(
    pgConnection,
    "subscription_settings",
    settingsIds
  )
  const deletedAnalyticsSnapshots = await deleteFromTable(
    pgConnection,
    "subscription_metrics_daily",
    analyticsSnapshotIds
  )
  const deletedRetentionOfferEvents = await deleteFromTable(
    pgConnection,
    "retention_offer_event",
    retentionOfferEventIds
  )
  const deletedRetentionOfferEventsByCase = await deleteFromTableByColumn(
    pgConnection,
    "retention_offer_event",
    "cancellation_case_id",
    cancellationCaseIds
  )
  const deletedCancellationCases = await deleteFromTable(
    pgConnection,
    "cancellation_case",
    cancellationCaseIds
  )
  const deletedDunningAttempts = await deleteFromTable(
    pgConnection,
    "dunning_attempt",
    dunningAttemptIds
  )
  const deletedDunningAttemptsByCase = await deleteFromTableByColumn(
    pgConnection,
    "dunning_attempt",
    "dunning_case_id",
    dunningCaseIds
  )
  const deletedDunningCases = await deleteFromTable(
    pgConnection,
    "dunning_case",
    dunningCaseIds
  )
  const deletedRenewalAttempts = await deleteFromTable(
    pgConnection,
    "renewal_attempt",
    renewalAttemptIds
  )
  const deletedRenewalAttemptsByCycle = await deleteFromTableByColumn(
    pgConnection,
    "renewal_attempt",
    "renewal_cycle_id",
    renewalCycleIds
  )
  const deletedRenewalCycles = await deleteFromTable(
    pgConnection,
    "renewal_cycle",
    renewalCycleIds
  )
  const deletedSubscriptions = await deleteFromTable(
    pgConnection,
    "subscription",
    subscriptionIds
  )
  const deletedPlanOffers = await deleteFromTable(
    pgConnection,
    "plan_offer",
    planOfferIds
  )
  if (seededCustomerIds.length) {
    await customerModule.deleteCustomers(seededCustomerIds)
  }

  logger.info("[subscriptions-test-data-reset] Reset completed.")
  logger.info(
    `[subscriptions-test-data-reset] Removed settings=${deletedSettings} plan_offers=${deletedPlanOffers} subscriptions=${deletedSubscriptions} renewal_cycles=${deletedRenewalCycles} renewal_attempts=${deletedRenewalAttempts + deletedRenewalAttemptsByCycle} dunning_cases=${deletedDunningCases} dunning_attempts=${deletedDunningAttempts + deletedDunningAttemptsByCase} cancellation_cases=${deletedCancellationCases} retention_offer_events=${deletedRetentionOfferEvents + deletedRetentionOfferEventsByCase} subscription_logs=${deletedSubscriptionLogs} analytics_snapshots=${deletedAnalyticsSnapshots} orders=${seededOrderIds.length} customers=${seededCustomerIds.length}`
  )
}
