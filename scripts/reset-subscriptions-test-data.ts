import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const SEED_NAMESPACE = "subscriptions-test-data"

const IDS = {
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
} as const

type QueryRecord = {
  id: string
  metadata?: Record<string, unknown> | null
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

  logger.info("[subscriptions-test-data-reset] Resolving seeded records")

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

  logger.info("[subscriptions-test-data-reset] Reset completed.")
  logger.info(
    `[subscriptions-test-data-reset] Removed plan_offers=${deletedPlanOffers} subscriptions=${deletedSubscriptions} renewal_cycles=${deletedRenewalCycles} renewal_attempts=${deletedRenewalAttempts + deletedRenewalAttemptsByCycle} dunning_cases=${deletedDunningCases} dunning_attempts=${deletedDunningAttempts + deletedDunningAttemptsByCase} cancellation_cases=${deletedCancellationCases} retention_offer_events=${deletedRetentionOfferEvents + deletedRetentionOfferEventsByCase}`
  )
}
