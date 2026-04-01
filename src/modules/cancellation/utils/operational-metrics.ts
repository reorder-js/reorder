import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CancellationFinalOutcome,
  RetentionOfferDecisionStatus,
} from "../types"

type CancellationCaseMetricRecord = {
  id: string
  reason_category: string | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: string | null
  created_at: string
}

type RetentionOfferMetricRecord = {
  id: string
  decision_status: RetentionOfferDecisionStatus
  created_at: string
}

export type CancellationReasonCategoryCount = {
  reason_category: string
  count: number
}

export type CancellationOperationalMetrics = {
  window_hours: number
  case_count: number
  terminal_case_count: number
  canceled_count: number
  retained_count: number
  pause_count: number
  churn_rate: number
  offer_acceptance_rate: number
  top_reason_categories: CancellationReasonCategoryCount[]
  spike_reason_category: string | null
  spike_current_count: number
  spike_previous_count: number
}

type ListCancellationOperationalMetricsInput = {
  window_hours?: number
  now?: Date
}

export async function listCancellationOperationalMetrics(
  container: MedusaContainer,
  input: ListCancellationOperationalMetricsInput = {}
): Promise<CancellationOperationalMetrics> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const windowHours = input.window_hours ?? 24

  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new Error("Cancellation metrics window is invalid")
  }

  const now = input.now ?? new Date()
  const currentWindowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000)
  const previousWindowStart = new Date(
    currentWindowStart.getTime() - windowHours * 60 * 60 * 1000
  )

  const [
    currentCasesResult,
    previousCanceledCasesResult,
    currentOfferEventsResult,
  ] = await Promise.all([
    query.graph({
      entity: "cancellation_case",
      fields: ["id", "reason_category", "final_outcome", "finalized_at", "created_at"],
      filters: {
        created_at: {
          $gte: currentWindowStart.toISOString(),
          $lte: now.toISOString(),
        },
      },
    }),
    query.graph({
      entity: "cancellation_case",
      fields: ["id", "reason_category", "final_outcome", "finalized_at", "created_at"],
      filters: {
        finalized_at: {
          $gte: previousWindowStart.toISOString(),
          $lt: currentWindowStart.toISOString(),
        },
        final_outcome: [CancellationFinalOutcome.CANCELED],
      },
    }),
    query.graph({
      entity: "retention_offer_event",
      fields: ["id", "decision_status", "created_at"],
      filters: {
        created_at: {
          $gte: currentWindowStart.toISOString(),
          $lte: now.toISOString(),
        },
      },
    }),
  ])

  const currentCases = (currentCasesResult.data ?? []) as CancellationCaseMetricRecord[]
  const previousCanceledCases =
    (previousCanceledCasesResult.data ?? []) as CancellationCaseMetricRecord[]
  const currentOfferEvents =
    (currentOfferEventsResult.data ?? []) as RetentionOfferMetricRecord[]

  const terminalCases = currentCases.filter((record) => record.final_outcome !== null)
  const canceledCases = terminalCases.filter(
    (record) => record.final_outcome === CancellationFinalOutcome.CANCELED
  )
  const retainedCases = terminalCases.filter(
    (record) => record.final_outcome === CancellationFinalOutcome.RETAINED
  )
  const pausedCases = terminalCases.filter(
    (record) => record.final_outcome === CancellationFinalOutcome.PAUSED
  )

  const topReasonCategories = countReasonCategories(canceledCases)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)

  const currentReasonMap = toReasonCountMap(canceledCases)
  const previousReasonMap = toReasonCountMap(previousCanceledCases)
  const spike = detectReasonCategorySpike(currentReasonMap, previousReasonMap)

  const acceptedOrApplied = currentOfferEvents.filter((record) =>
    [
      RetentionOfferDecisionStatus.ACCEPTED,
      RetentionOfferDecisionStatus.APPLIED,
    ].includes(record.decision_status)
  ).length

  return {
    window_hours: windowHours,
    case_count: currentCases.length,
    terminal_case_count: terminalCases.length,
    canceled_count: canceledCases.length,
    retained_count: retainedCases.length + pausedCases.length,
    pause_count: pausedCases.length,
    churn_rate: terminalCases.length
      ? Number((canceledCases.length / terminalCases.length).toFixed(4))
      : 0,
    offer_acceptance_rate: currentOfferEvents.length
      ? Number((acceptedOrApplied / currentOfferEvents.length).toFixed(4))
      : 0,
    top_reason_categories: topReasonCategories,
    spike_reason_category: spike.reason_category,
    spike_current_count: spike.current_count,
    spike_previous_count: spike.previous_count,
  }
}

export function isCancellationReasonSpikeAlertable(
  metrics: CancellationOperationalMetrics,
  threshold = 5
) {
  if (!metrics.spike_reason_category) {
    return false
  }

  if (metrics.spike_current_count >= threshold && metrics.spike_previous_count === 0) {
    return true
  }

  return (
    metrics.spike_current_count >= threshold &&
    metrics.spike_current_count >= metrics.spike_previous_count * 2
  )
}

function toReasonCountMap(records: CancellationCaseMetricRecord[]) {
  const counts = new Map<string, number>()

  for (const record of records) {
    const key = record.reason_category ?? "unclassified"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

function countReasonCategories(records: CancellationCaseMetricRecord[]) {
  return [...toReasonCountMap(records).entries()].map(([reason_category, count]) => ({
    reason_category,
    count,
  }))
}

function detectReasonCategorySpike(
  currentReasonMap: Map<string, number>,
  previousReasonMap: Map<string, number>
) {
  let selected: {
    reason_category: string | null
    current_count: number
    previous_count: number
    growth: number
  } = {
    reason_category: null,
    current_count: 0,
    previous_count: 0,
    growth: 0,
  }

  for (const [reasonCategory, currentCount] of currentReasonMap.entries()) {
    const previousCount = previousReasonMap.get(reasonCategory) ?? 0
    const growth =
      previousCount === 0 ? currentCount : currentCount / previousCount

    if (
      currentCount > selected.current_count ||
      (currentCount === selected.current_count && growth > selected.growth)
    ) {
      selected = {
        reason_category: reasonCategory,
        current_count: currentCount,
        previous_count: previousCount,
        growth,
      }
    }
  }

  return selected
}
