import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  ANALYTICS_MODULE,
} from "../../modules/analytics"
import AnalyticsModuleService from "../../modules/analytics/service"
import {
  classifyAnalyticsFailure,
  getAnalyticsErrorMessage,
  logAnalyticsEvent,
} from "../../modules/analytics/utils/observability"
import {
  CancellationFinalOutcome,
  CancellationReasonCategory,
} from "../../modules/cancellation/types"
import {
  ActivityLogEventType,
} from "../../modules/activity-log/types"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../../modules/subscription/types"
import {
  RebuildAnalyticsDailySnapshotsStepOutput,
} from "./normalize-analytics-rebuild-range"

type QueryLike = {
  graph(input: Record<string, unknown>): Promise<{
    data?: unknown[]
    metadata?: {
      count?: number
      take?: number
      skip?: number
    }
  }>
}

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

type SubscriptionAnalyticsRecord = {
  id: string
  customer_id: string
  product_id: string
  variant_id: string
  status: SubscriptionStatus
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  started_at: string
  paused_at: string | null
  cancel_effective_at: string | null
}

type SubscriptionLogLifecycleRecord = {
  subscription_id: string
  event_type: ActivityLogEventType
  created_at: string
  previous_state: {
    status?: SubscriptionStatus
  } | null
}

type DunningCaseAnalyticsRecord = {
  subscription_id: string
  created_at: string
  recovered_at: string | null
  closed_at: string | null
}

type CancellationAnalyticsRecord = {
  subscription_id: string
  reason_category: CancellationReasonCategory | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: string | null
}

type RenewalCycleAnalyticsRecord = {
  subscription_id: string
  generated_order_id: string | null
  scheduled_for: string
}

type OrderAnalyticsRecord = {
  id: string
  total?: number | string | null
  currency_code?: string | null
}

type SubscriptionMetricsDailyRecord = {
  id: string
  metric_date: Date
  subscription_id: string
  customer_id: string
  product_id: string
  variant_id: string
  status: SubscriptionStatus
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  currency_code: string | null
  is_active: boolean
  active_subscriptions_count: number
  mrr_amount: number | null
  churned_subscriptions_count: number
  churn_reason_category: CancellationReasonCategory | null
  source_snapshot: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

type CreateSubscriptionMetricsDailyInput = Omit<
  SubscriptionMetricsDailyRecord,
  "id" | "created_at" | "updated_at" | "deleted_at"
>

function getQuery(container: MedusaContainer) {
  return container.resolve<QueryLike>(ContainerRegistrationKeys.QUERY)
}

function getLocking(container: MedusaContainer) {
  return container.resolve<LockingService>(Modules.LOCKING)
}

function toUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildAnalyticsRangeLockKey(input: RebuildAnalyticsDailySnapshotsStepOutput) {
  return `analytics:snapshots:range:${input.date_from.slice(0, 10)}:${input.date_to.slice(0, 10)}`
}

function buildAnalyticsDayLockKey(dayStart: Date) {
  return `analytics:snapshots:${toUtcDateKey(dayStart)}`
}

function toUtcDayStart(dayIso: string) {
  return new Date(dayIso)
}

function toUtcDayEnd(dayStart: Date) {
  return new Date(
    Date.UTC(
      dayStart.getUTCFullYear(),
      dayStart.getUTCMonth(),
      dayStart.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

function normalizeMonthlyRecurringValue(
  amount: number,
  interval: SubscriptionFrequencyInterval,
  value: number
) {
  if (!Number.isFinite(amount) || !Number.isFinite(value) || value <= 0) {
    return null
  }

  if (interval === SubscriptionFrequencyInterval.WEEK) {
    return Number(((amount * 52) / (12 * value)).toFixed(2))
  }

  if (interval === SubscriptionFrequencyInterval.MONTH) {
    return Number((amount / value).toFixed(2))
  }

  return Number((amount / (12 * value)).toFixed(2))
}

function isDunningOpenAtDayEnd(
  dunningCase: DunningCaseAnalyticsRecord,
  dayEnd: Date
) {
  const createdAt = new Date(dunningCase.created_at)
  const recoveredAt = dunningCase.recovered_at
    ? new Date(dunningCase.recovered_at)
    : null
  const closedAt = dunningCase.closed_at ? new Date(dunningCase.closed_at) : null

  return (
    createdAt <= dayEnd &&
    (!recoveredAt || recoveredAt > dayEnd) &&
    (!closedAt || closedAt > dayEnd)
  )
}

function resolveSubscriptionStatusForDay(
  subscription: SubscriptionAnalyticsRecord,
  latestLifecycleEvent: SubscriptionLogLifecycleRecord | null,
  hasOpenDunningAtDayEnd: boolean,
  dayEnd: Date
) {
  if (
    subscription.cancel_effective_at &&
    new Date(subscription.cancel_effective_at) <= dayEnd
  ) {
    return SubscriptionStatus.CANCELLED
  }

  if (latestLifecycleEvent?.event_type === ActivityLogEventType.SUBSCRIPTION_PAUSED) {
    return SubscriptionStatus.PAUSED
  }

  if (
    latestLifecycleEvent?.event_type === ActivityLogEventType.SUBSCRIPTION_CANCELED &&
    subscription.cancel_effective_at &&
    new Date(subscription.cancel_effective_at) > dayEnd
  ) {
    return latestLifecycleEvent.previous_state?.status ?? SubscriptionStatus.ACTIVE
  }

  if (
    latestLifecycleEvent?.event_type === ActivityLogEventType.SUBSCRIPTION_RESUMED
  ) {
    return SubscriptionStatus.ACTIVE
  }

  if (hasOpenDunningAtDayEnd) {
    return SubscriptionStatus.PAST_DUE
  }

  if (
    subscription.status === SubscriptionStatus.PAUSED &&
    subscription.paused_at &&
    new Date(subscription.paused_at) <= dayEnd
  ) {
    return SubscriptionStatus.PAUSED
  }

  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    return SubscriptionStatus.PAST_DUE
  }

  return SubscriptionStatus.ACTIVE
}

async function listSubscriptionsForDay(
  container: MedusaContainer,
  dayEnd: Date,
  batchSize: number,
  offset: number
) {
  const query = getQuery(container)

  const result = await query.graph({
    entity: "subscription",
    fields: [
      "id",
      "customer_id",
      "product_id",
      "variant_id",
      "status",
      "frequency_interval",
      "frequency_value",
      "started_at",
      "paused_at",
      "cancel_effective_at",
    ],
    filters: {
      started_at: {
        $lte: dayEnd.toISOString(),
      },
    },
    pagination: {
      take: batchSize,
      skip: offset,
      order: {
        id: "ASC",
      },
    },
  })

  return {
    subscriptions: (result.data ?? []) as SubscriptionAnalyticsRecord[],
    count: result.metadata?.count ?? 0,
    limit: result.metadata?.take ?? batchSize,
    offset: result.metadata?.skip ?? offset,
  }
}

async function listLifecycleEvents(
  container: MedusaContainer,
  subscriptionIds: string[],
  dayEnd: Date
) {
  if (!subscriptionIds.length) {
    return []
  }

  const query = getQuery(container)
  const result = await query.graph({
    entity: "subscription_log",
    fields: [
      "subscription_id",
      "event_type",
      "created_at",
      "previous_state",
    ],
    filters: {
      subscription_id: subscriptionIds,
      event_type: [
        ActivityLogEventType.SUBSCRIPTION_PAUSED,
        ActivityLogEventType.SUBSCRIPTION_RESUMED,
        ActivityLogEventType.SUBSCRIPTION_CANCELED,
      ],
      created_at: {
        $lte: dayEnd.toISOString(),
      },
    },
  })

  return (result.data ?? []) as SubscriptionLogLifecycleRecord[]
}

async function listDunningCases(
  container: MedusaContainer,
  subscriptionIds: string[],
  dayEnd: Date
) {
  if (!subscriptionIds.length) {
    return []
  }

  const query = getQuery(container)
  const result = await query.graph({
    entity: "dunning_case",
    fields: ["subscription_id", "created_at", "recovered_at", "closed_at"],
    filters: {
      subscription_id: subscriptionIds,
      created_at: {
        $lte: dayEnd.toISOString(),
      },
    },
  })

  return (result.data ?? []) as DunningCaseAnalyticsRecord[]
}

async function listChurnEvents(
  container: MedusaContainer,
  subscriptionIds: string[],
  dayStart: Date,
  dayEnd: Date
) {
  if (!subscriptionIds.length) {
    return []
  }

  const query = getQuery(container)
  const result = await query.graph({
    entity: "cancellation_case",
    fields: ["subscription_id", "reason_category", "final_outcome", "finalized_at"],
    filters: {
      subscription_id: subscriptionIds,
      final_outcome: [CancellationFinalOutcome.CANCELED],
      finalized_at: {
        $gte: dayStart.toISOString(),
        $lte: dayEnd.toISOString(),
      },
    },
  })

  return (result.data ?? []) as CancellationAnalyticsRecord[]
}

async function listSuccessfulRenewalCycles(
  container: MedusaContainer,
  subscriptionIds: string[],
  dayEnd: Date
) {
  if (!subscriptionIds.length) {
    return []
  }

  const query = getQuery(container)
  const result = await query.graph({
    entity: "renewal_cycle",
    fields: ["subscription_id", "generated_order_id", "scheduled_for"],
    filters: {
      subscription_id: subscriptionIds,
      status: ["succeeded"],
      scheduled_for: {
        $lte: dayEnd.toISOString(),
      },
    },
  })

  return ((result.data ?? []) as RenewalCycleAnalyticsRecord[]).filter(
    (cycle) => cycle.generated_order_id
  )
}

async function listOrders(
  container: MedusaContainer,
  orderIds: string[]
) {
  if (!orderIds.length) {
    return []
  }

  const query = getQuery(container)
  const result = await query.graph({
    entity: "order",
    fields: ["id", "total", "currency_code"],
    filters: {
      id: orderIds,
    },
  })

  return (result.data ?? []) as OrderAnalyticsRecord[]
}

async function rebuildSingleDay(
  container: MedusaContainer,
  analyticsModule: AnalyticsModuleService,
  input: RebuildAnalyticsDailySnapshotsStepOutput,
  dayIso: string
) {
  const dayStart = toUtcDayStart(dayIso)
  const dayEnd = toUtcDayEnd(dayStart)
  const batchSize = 100

  let offset = 0
  let processedSubscriptions = 0
  const rows: CreateSubscriptionMetricsDailyInput[] = []

  while (true) {
    const page = await listSubscriptionsForDay(container, dayEnd, batchSize, offset)
    const subscriptions = page.subscriptions

    if (!subscriptions.length) {
      break
    }

    const subscriptionIds = subscriptions.map((subscription) => subscription.id)
    const [lifecycleEvents, dunningCases, churnEvents, renewalCycles] =
      await Promise.all([
        listLifecycleEvents(container, subscriptionIds, dayEnd),
        listDunningCases(container, subscriptionIds, dayEnd),
        listChurnEvents(container, subscriptionIds, dayStart, dayEnd),
        listSuccessfulRenewalCycles(container, subscriptionIds, dayEnd),
      ])

    const latestLifecycleEventBySubscription = new Map<string, SubscriptionLogLifecycleRecord>()
    const openDunningBySubscription = new Map<string, boolean>()
    const churnBySubscription = new Map<string, CancellationAnalyticsRecord>()
    const latestRenewalBySubscription = new Map<string, RenewalCycleAnalyticsRecord>()

    for (const event of lifecycleEvents) {
      const existing = latestLifecycleEventBySubscription.get(event.subscription_id)

      if (
        !existing ||
        new Date(existing.created_at).getTime() < new Date(event.created_at).getTime()
      ) {
        latestLifecycleEventBySubscription.set(event.subscription_id, event)
      }
    }

    for (const dunningCase of dunningCases) {
      if (isDunningOpenAtDayEnd(dunningCase, dayEnd)) {
        openDunningBySubscription.set(dunningCase.subscription_id, true)
      }
    }

    for (const churnEvent of churnEvents) {
      churnBySubscription.set(churnEvent.subscription_id, churnEvent)
    }

    for (const renewalCycle of renewalCycles) {
      const existing = latestRenewalBySubscription.get(renewalCycle.subscription_id)

      if (
        !existing ||
        new Date(existing.scheduled_for).getTime() <
          new Date(renewalCycle.scheduled_for).getTime()
      ) {
        latestRenewalBySubscription.set(renewalCycle.subscription_id, renewalCycle)
      }
    }

    const orderIds = [...latestRenewalBySubscription.values()]
      .map((cycle) => cycle.generated_order_id)
      .filter((id): id is string => Boolean(id))

    const orders = await listOrders(container, orderIds)
    const ordersById = new Map<string, OrderAnalyticsRecord>(
      orders.map((order) => [order.id, order])
    )

    for (const subscription of subscriptions) {
      const lifecycleEvent =
        latestLifecycleEventBySubscription.get(subscription.id) ?? null
      const derivedStatus = resolveSubscriptionStatusForDay(
        subscription,
        lifecycleEvent,
        openDunningBySubscription.get(subscription.id) ?? false,
        dayEnd
      )
      const isActive = derivedStatus === SubscriptionStatus.ACTIVE
      const churnEvent = churnBySubscription.get(subscription.id) ?? null
      const latestRenewal = latestRenewalBySubscription.get(subscription.id) ?? null
      const latestOrder = latestRenewal?.generated_order_id
        ? ordersById.get(latestRenewal.generated_order_id) ?? null
        : null
      const orderTotal = latestOrder ? Number(latestOrder.total ?? 0) : null
      const mrrAmount =
        isActive && latestOrder && Number.isFinite(orderTotal)
          ? normalizeMonthlyRecurringValue(
              orderTotal!,
              subscription.frequency_interval,
              subscription.frequency_value
            )
          : null

      rows.push({
        metric_date: dayStart,
        subscription_id: subscription.id,
        customer_id: subscription.customer_id,
        product_id: subscription.product_id,
        variant_id: subscription.variant_id,
        status: derivedStatus,
        frequency_interval: subscription.frequency_interval,
        frequency_value: subscription.frequency_value,
        currency_code: latestOrder?.currency_code ?? null,
        is_active: isActive,
        active_subscriptions_count: isActive ? 1 : 0,
        mrr_amount: mrrAmount,
        churned_subscriptions_count: churnEvent ? 1 : 0,
        churn_reason_category: churnEvent?.reason_category ?? null,
        source_snapshot: {
          lifecycle_event_type: lifecycleEvent?.event_type ?? null,
          dunning_open_at_day_end: openDunningBySubscription.get(subscription.id) ?? false,
          renewal_order_id: latestRenewal?.generated_order_id ?? null,
          revenue_source: latestOrder ? "latest_successful_renewal_order" : "unavailable",
          churn_source: churnEvent ? "cancellation_case" : null,
        },
        metadata: {
          trigger_type: input.trigger_type,
          correlation_id: input.correlation_id,
          reason: input.reason,
        },
      })
    }

    processedSubscriptions += subscriptions.length
    offset += page.limit

    if (offset >= page.count) {
      break
    }
  }

  const previousRows = (await analyticsModule.listSubscriptionMetricsDailies({
    metric_date: dayStart,
  } as any)) as SubscriptionMetricsDailyRecord[]

  let deletedExistingRows = false

  try {
    if (previousRows.length) {
      await analyticsModule.deleteSubscriptionMetricsDailies(
        previousRows.map((row) => row.id)
      )
      deletedExistingRows = true
    }

    if (rows.length) {
      await analyticsModule.createSubscriptionMetricsDailies(rows as any)
    }

    return {
      processed_subscriptions: processedSubscriptions,
      upserted_rows: rows.length,
      skipped_rows: 0,
      failed: false,
    }
  } catch (error) {
    if (deletedExistingRows && previousRows.length) {
      try {
        await analyticsModule.createSubscriptionMetricsDailies(previousRows as any)
      } catch {
        // Ignore restore failure here; the calling workflow will surface the original failure.
      }
    }

    throw error
  }
}

export const rebuildAnalyticsDailySnapshotsStep = createStep(
  "rebuild-analytics-daily-snapshots",
  async function (
    input: RebuildAnalyticsDailySnapshotsStepOutput,
    { container }
  ) {
    const logger = (container as MedusaContainer).resolve("logger")
    const analyticsModule =
      container.resolve<AnalyticsModuleService>(ANALYTICS_MODULE)
    const locking = getLocking(container as MedusaContainer)
    const startedAt = Date.now()

    let processedSubscriptions = 0
    let upsertedRows = 0
    const blockedDays: string[] = []
    const failedDays: string[] = []

    logAnalyticsEvent(logger, "info", {
      event: "analytics.rebuild",
      outcome: "started",
      correlation_id: input.correlation_id,
      trigger_type: input.trigger_type,
      reason: input.reason,
      date_from: input.date_from,
      date_to: input.date_to,
      processed_days: 0,
      processed_subscriptions: 0,
      upserted_rows: 0,
      failure_count: 0,
      blocked_count: 0,
      message: "Analytics rebuild started",
    })

    try {
      await locking.execute(
        buildAnalyticsRangeLockKey(input),
        async () => {
          for (const dayIso of input.normalized_days) {
            const dayStart = toUtcDayStart(dayIso)

            try {
              const summary = await locking.execute(
                buildAnalyticsDayLockKey(dayStart),
                async () =>
                  rebuildSingleDay(
                    container as MedusaContainer,
                    analyticsModule,
                    input,
                    dayIso
                  ),
                {
                  timeout: 1,
                }
              )

              processedSubscriptions += summary.processed_subscriptions
              upsertedRows += summary.upserted_rows
            } catch (error) {
              const failureKind = classifyAnalyticsFailure(error)

              if (failureKind === "lock_timeout") {
                blockedDays.push(dayIso)
              } else {
                failedDays.push(dayIso)
              }
            }
          }
        },
        {
          timeout: 1,
        }
      )
    } catch (error) {
      const failureKind = classifyAnalyticsFailure(error)

      if (failureKind === "lock_timeout") {
        blockedDays.push(...input.normalized_days)
      } else {
        failedDays.push(...input.normalized_days)
      }
    }

    const processedDays =
      input.normalized_days.length - failedDays.length - blockedDays.length

    logAnalyticsEvent(
      logger,
      failedDays.length > 0 ? "error" : blockedDays.length > 0 ? "warn" : "info",
      {
        event: "analytics.rebuild",
        outcome:
          failedDays.length > 0
            ? "failed"
            : blockedDays.length > 0
              ? "blocked"
              : "completed",
        correlation_id: input.correlation_id,
        trigger_type: input.trigger_type,
        reason: input.reason,
        duration_ms: Date.now() - startedAt,
        date_from: input.date_from,
        date_to: input.date_to,
        processed_days: processedDays,
        processed_subscriptions: processedSubscriptions,
        upserted_rows: upsertedRows,
        blocked_count: blockedDays.length,
        failure_count: failedDays.length,
        blocked_days: blockedDays,
        failed_days: failedDays,
        alertable: failedDays.length > 0,
        failure_kind:
          failedDays.length > 0
            ? "unexpected_error"
            : blockedDays.length > 0
              ? "lock_timeout"
              : undefined,
        message:
          failedDays.length > 0
            ? getAnalyticsErrorMessage(
                new Error("Analytics rebuild completed with failed days")
              )
            : blockedDays.length > 0
              ? "Analytics rebuild completed with blocked days"
              : "Analytics rebuild completed",
      }
    )

    return new StepResponse<RebuildAnalyticsDailySnapshotsStepOutput>({
      ...input,
      processed_days: processedDays,
      processed_subscriptions: processedSubscriptions,
      upserted_rows: upsertedRows,
      skipped_rows: blockedDays.length,
      blocked_days: blockedDays,
      failed_days: failedDays,
    })
  }
)
