import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CancellationAdminDunningSummary,
  CancellationAdminOfferEventRecord,
  CancellationAdminRenewalSummary,
  CancellationAdminSubscriptionSummary,
  CancellationCaseAdminDetail,
  CancellationCaseAdminDetailResponse,
  CancellationCaseAdminListItem,
  CancellationCaseAdminListResponse,
  CancellationCaseAdminStatus,
  CancellationFinalOutcomeAdmin,
  RetentionOfferDecisionAdminStatus,
} from "../../../admin/types/cancellation"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  RetentionOfferType,
  RetentionOfferDecisionStatus,
} from "../types"
import { cancellationErrors } from "./errors"

export type ListAdminCancellationCasesInput = {
  limit?: number
  offset?: number
  order?: string
  direction?: "asc" | "desc"
  q?: string
  status?: string[]
  final_outcome?: string[]
  reason_category?: string[]
  offer_type?: RetentionOfferType[]
  subscription_id?: string
  created_from?: string
  created_to?: string
}

type CancellationCaseRecord = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: string | null
  notes: string | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: string | null
  finalized_by: string | null
  cancellation_effective_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type RetentionOfferEventRecord = {
  id: string
  cancellation_case_id: string
  offer_type: "pause_offer" | "discount_offer" | "bonus_offer"
  offer_payload: Record<string, unknown> | null
  decision_status: RetentionOfferDecisionStatus
  decision_reason: string | null
  decided_at: string | null
  decided_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type SubscriptionRecord = {
  id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  next_renewal_at: string | null
  last_renewal_at: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_effective_at: string | null
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string
    variant_title?: string
    sku?: string | null
  } | null
}

type DunningCaseRecord = {
  id: string
  subscription_id: string
  status:
    | "open"
    | "retry_scheduled"
    | "retrying"
    | "awaiting_manual_resolution"
    | "recovered"
    | "unrecovered"
  attempt_count: number
  next_retry_at: string | null
  last_payment_error_message: string | null
}

type RenewalCycleRecord = {
  id: string
  subscription_id: string
  status: "scheduled" | "processing" | "succeeded" | "failed"
  scheduled_for: string
  approval_status: "pending" | "approved" | "rejected" | null
  generated_order_id: string | null
}

const caseListFields = [
  "id",
  "subscription_id",
  "status",
  "reason",
  "reason_category",
  "final_outcome",
  "finalized_at",
  "created_at",
  "updated_at",
] as const

const caseDetailFields = [
  ...caseListFields,
  "notes",
  "finalized_by",
  "cancellation_effective_at",
  "metadata",
] as const

const offerFields = [
  "id",
  "cancellation_case_id",
  "offer_type",
  "offer_payload",
  "decision_status",
  "decision_reason",
  "decided_at",
  "decided_by",
  "applied_at",
  "metadata",
  "created_at",
  "updated_at",
] as const

const subscriptionFields = [
  "id",
  "reference",
  "status",
  "next_renewal_at",
  "last_renewal_at",
  "paused_at",
  "cancelled_at",
  "cancel_effective_at",
  "customer_snapshot",
  "product_snapshot",
] as const

const databaseSortableFields = new Set([
  "created_at",
  "updated_at",
  "status",
  "final_outcome",
  "reason_category",
  "finalized_at",
])

const inMemorySortableFields = new Set([
  "subscription_reference",
  "customer_name",
  "product_title",
])

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw cancellationErrors.invalidData(`Unsupported sort field '${order}'`)
  }
}

function mapCaseStatus(status: CancellationCaseRecord["status"]) {
  switch (status) {
    case CancellationCaseStatus.REQUESTED:
      return CancellationCaseAdminStatus.REQUESTED
    case CancellationCaseStatus.EVALUATING_RETENTION:
      return CancellationCaseAdminStatus.EVALUATING_RETENTION
    case CancellationCaseStatus.RETENTION_OFFERED:
      return CancellationCaseAdminStatus.RETENTION_OFFERED
    case CancellationCaseStatus.RETAINED:
      return CancellationCaseAdminStatus.RETAINED
    case CancellationCaseStatus.PAUSED:
      return CancellationCaseAdminStatus.PAUSED
    case CancellationCaseStatus.CANCELED:
      return CancellationCaseAdminStatus.CANCELED
  }

  throw cancellationErrors.invalidData(
    `Unsupported cancellation case status '${status}'`
  )
}

function mapFinalOutcome(
  outcome: CancellationCaseRecord["final_outcome"]
): CancellationFinalOutcomeAdmin | null {
  switch (outcome) {
    case CancellationFinalOutcome.RETAINED:
      return CancellationFinalOutcomeAdmin.RETAINED
    case CancellationFinalOutcome.PAUSED:
      return CancellationFinalOutcomeAdmin.PAUSED
    case CancellationFinalOutcome.CANCELED:
      return CancellationFinalOutcomeAdmin.CANCELED
    default:
      return null
  }
}

function mapOfferDecisionStatus(
  status: RetentionOfferEventRecord["decision_status"]
) {
  switch (status) {
    case RetentionOfferDecisionStatus.PROPOSED:
      return RetentionOfferDecisionAdminStatus.PROPOSED
    case RetentionOfferDecisionStatus.ACCEPTED:
      return RetentionOfferDecisionAdminStatus.ACCEPTED
    case RetentionOfferDecisionStatus.REJECTED:
      return RetentionOfferDecisionAdminStatus.REJECTED
    case RetentionOfferDecisionStatus.APPLIED:
      return RetentionOfferDecisionAdminStatus.APPLIED
    case RetentionOfferDecisionStatus.EXPIRED:
      return RetentionOfferDecisionAdminStatus.EXPIRED
  }

  throw cancellationErrors.invalidData(
    `Unsupported retention offer decision status '${status}'`
  )
}

function buildFilters(input: ListAdminCancellationCasesInput) {
  const filters: Record<string, unknown> = {}

  if (input.status?.length) {
    filters.status = input.status
  }

  if (input.final_outcome?.length) {
    filters.final_outcome = input.final_outcome
  }

  if (input.reason_category?.length) {
    filters.reason_category = input.reason_category
  }

  if (input.subscription_id) {
    filters.subscription_id = input.subscription_id
  }

  if (input.created_from || input.created_to) {
    filters.created_at = {
      ...(input.created_from ? { $gte: input.created_from } : {}),
      ...(input.created_to ? { $lte: input.created_to } : {}),
    }
  }

  return filters
}

async function getCancellationCaseIdsForOfferTypes(
  container: MedusaContainer,
  offerTypes: RetentionOfferType[]
): Promise<string[]> {
  if (!offerTypes.length) {
    return []
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "retention_offer_event",
    fields: ["cancellation_case_id"],
    filters: {
      offer_type: offerTypes,
    },
  })

  return [...new Set(
    (data as Array<{ cancellation_case_id: string }>).map(
      (record) => record.cancellation_case_id
    )
  )]
}

async function getSubscriptionSummaryMap(
  container: MedusaContainer,
  subscriptionIds: string[]
): Promise<Map<string, CancellationAdminSubscriptionSummary>> {
  if (!subscriptionIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "subscription",
    fields: [...subscriptionFields],
    filters: {
      id: [...new Set(subscriptionIds)],
    },
  })

  return new Map(
    (data as SubscriptionRecord[]).map((subscription) => [
      subscription.id,
      {
        subscription_id: subscription.id,
        reference: subscription.reference,
        status: subscription.status,
        customer_name: subscription.customer_snapshot?.full_name ?? "Unknown customer",
        product_title:
          subscription.product_snapshot?.product_title ?? "Unknown product",
        variant_title:
          subscription.product_snapshot?.variant_title ?? "Unknown variant",
        sku: subscription.product_snapshot?.sku ?? null,
        next_renewal_at: subscription.next_renewal_at,
        last_renewal_at: subscription.last_renewal_at,
        paused_at: subscription.paused_at,
        cancelled_at: subscription.cancelled_at,
        cancel_effective_at: subscription.cancel_effective_at,
      },
    ])
  )
}

async function getActiveDunningSummaryMap(
  container: MedusaContainer,
  subscriptionIds: string[]
): Promise<Map<string, CancellationAdminDunningSummary>> {
  if (!subscriptionIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "dunning_case",
    fields: [
      "id",
      "subscription_id",
      "status",
      "attempt_count",
      "next_retry_at",
      "last_payment_error_message",
    ],
    filters: {
      subscription_id: [...new Set(subscriptionIds)],
    },
  })

  const activeStatusOrder = new Map([
    ["retrying", 0],
    ["retry_scheduled", 1],
    ["awaiting_manual_resolution", 2],
    ["open", 3],
  ])

  const grouped = new Map<string, DunningCaseRecord[]>()
  for (const record of data as DunningCaseRecord[]) {
    const bucket = grouped.get(record.subscription_id) ?? []
    bucket.push(record)
    grouped.set(record.subscription_id, bucket)
  }

  const result = new Map<string, CancellationAdminDunningSummary>()

  for (const [subscriptionId, records] of grouped.entries()) {
    const active = records
      .filter((record) =>
        ["open", "retry_scheduled", "retrying", "awaiting_manual_resolution"].includes(
          record.status
        )
      )
      .sort((left, right) => {
        const leftRank = activeStatusOrder.get(left.status) ?? 999
        const rightRank = activeStatusOrder.get(right.status) ?? 999
        return leftRank - rightRank
      })[0]

    if (!active) {
      continue
    }

    result.set(subscriptionId, {
      dunning_case_id: active.id,
      status: active.status,
      attempt_count: active.attempt_count,
      next_retry_at: active.next_retry_at,
      last_payment_error_message: active.last_payment_error_message,
    })
  }

  return result
}

async function getRenewalSummaryMap(
  container: MedusaContainer,
  subscriptionIds: string[]
): Promise<Map<string, CancellationAdminRenewalSummary>> {
  if (!subscriptionIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "renewal_cycle",
    fields: [
      "id",
      "subscription_id",
      "status",
      "scheduled_for",
      "approval_status",
      "generated_order_id",
    ],
    filters: {
      subscription_id: [...new Set(subscriptionIds)],
    },
  })

  const grouped = new Map<string, RenewalCycleRecord[]>()
  for (const record of data as RenewalCycleRecord[]) {
    const bucket = grouped.get(record.subscription_id) ?? []
    bucket.push(record)
    grouped.set(record.subscription_id, bucket)
  }

  const result = new Map<string, CancellationAdminRenewalSummary>()

  for (const [subscriptionId, records] of grouped.entries()) {
    const selected = [...records].sort((left, right) =>
      left.scheduled_for.localeCompare(right.scheduled_for)
    )[0]

    if (!selected) {
      continue
    }

    result.set(subscriptionId, {
      renewal_cycle_id: selected.id,
      status: selected.status,
      scheduled_for: selected.scheduled_for,
      approval_status: selected.approval_status,
      generated_order_id: selected.generated_order_id,
    })
  }

  return result
}

async function getOfferHistory(
  container: MedusaContainer,
  cancellationCaseId: string
): Promise<CancellationAdminOfferEventRecord[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "retention_offer_event",
    fields: [...offerFields],
    filters: {
      cancellation_case_id: [cancellationCaseId],
    },
    pagination: {
      order: {
        created_at: "ASC",
      },
    },
  })

  return (data as RetentionOfferEventRecord[]).map((record) => ({
    id: record.id,
    offer_type: record.offer_type,
    offer_payload: record.offer_payload,
    decision_status: mapOfferDecisionStatus(record.decision_status),
    decision_reason: record.decision_reason,
    decided_at: record.decided_at,
    decided_by: record.decided_by,
    applied_at: record.applied_at,
    metadata: record.metadata,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }))
}

function mapListItem(
  record: CancellationCaseRecord,
  subscription: CancellationAdminSubscriptionSummary
): CancellationCaseAdminListItem {
  return {
    id: record.id,
    status: mapCaseStatus(record.status),
    reason: record.reason,
    reason_category: record.reason_category,
    final_outcome: mapFinalOutcome(record.final_outcome),
    subscription,
    created_at: record.created_at,
    finalized_at: record.finalized_at,
    updated_at: record.updated_at,
  }
}

function getSortableValue(
  item: CancellationCaseAdminListItem,
  order: string
) {
  switch (order) {
    case "created_at":
      return item.created_at
    case "updated_at":
      return item.updated_at
    case "status":
      return item.status
    case "final_outcome":
      return item.final_outcome ?? ""
    case "reason_category":
      return item.reason_category ?? ""
    case "finalized_at":
      return item.finalized_at ?? ""
    case "subscription_reference":
      return item.subscription.reference
    case "customer_name":
      return item.subscription.customer_name
    case "product_title":
      return item.subscription.product_title
    default:
      return ""
  }
}

function sortItems(
  items: CancellationCaseAdminListItem[],
  order: string,
  direction: "asc" | "desc"
) {
  const multiplier = direction === "asc" ? 1 : -1

  return [...items].sort((left, right) => {
    const leftValue = getSortableValue(left, order)
    const rightValue = getSortableValue(right, order)

    if (leftValue < rightValue) {
      return -1 * multiplier
    }

    if (leftValue > rightValue) {
      return 1 * multiplier
    }

    return 0
  })
}

function matchesSearch(item: CancellationCaseAdminListItem, search: string) {
  const value = search.trim().toLowerCase()

  if (!value.length) {
    return true
  }

  return [
    item.subscription.reference,
    item.subscription.customer_name,
    item.subscription.product_title,
    item.subscription.variant_title,
    item.reason ?? "",
    item.reason_category ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(value)
}

export async function listAdminCancellationCases(
  container: MedusaContainer,
  input: ListAdminCancellationCasesInput
): Promise<CancellationCaseAdminListResponse> {
  assertSortableField(input.order)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters = buildFilters(input)
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const direction = input.direction ?? "desc"
  const order = input.order
  const isInMemorySort =
    typeof order === "string" && inMemorySortableFields.has(order)
  const requiresInMemoryProcessing = Boolean(input.q) || isInMemorySort

  if (input.offer_type?.length) {
    const cancellationCaseIds = await getCancellationCaseIdsForOfferTypes(
      container,
      input.offer_type
    )

    if (!cancellationCaseIds.length) {
      return {
        cancellations: [],
        count: 0,
        limit,
        offset,
      }
    }

    filters.id = cancellationCaseIds
  }

  if (!requiresInMemoryProcessing) {
    const {
      data,
      metadata: { count = 0, take = limit, skip = offset } = {},
    } = await query.graph({
      entity: "cancellation_case",
      fields: [...caseListFields],
      filters,
      pagination: {
        take: limit,
        skip: offset,
        ...(order && databaseSortableFields.has(order)
          ? {
              order: {
                [order]: direction.toUpperCase(),
              },
            }
          : {}),
      },
    })

    const records = data as CancellationCaseRecord[]
    const subscriptionMap = await getSubscriptionSummaryMap(
      container,
      records.map((record) => record.subscription_id)
    )

    return {
      cancellations: records.map((record) =>
        mapListItem(
          record,
          subscriptionMap.get(record.subscription_id) ?? {
            subscription_id: record.subscription_id,
            reference: "Unknown subscription",
            status: "past_due",
            customer_name: "Unknown customer",
            product_title: "Unknown product",
            variant_title: "Unknown variant",
            sku: null,
            next_renewal_at: null,
            last_renewal_at: null,
            paused_at: null,
            cancelled_at: null,
            cancel_effective_at: null,
          }
        )
      ),
      count,
      limit: take,
      offset: skip,
    }
  }

  const { data } = await query.graph({
    entity: "cancellation_case",
    fields: [...caseListFields],
    filters,
    pagination: order && databaseSortableFields.has(order)
      ? {
          order: {
            [order]: direction.toUpperCase(),
          },
        }
      : undefined,
  })

  const records = data as CancellationCaseRecord[]
  const subscriptionMap = await getSubscriptionSummaryMap(
    container,
    records.map((record) => record.subscription_id)
  )

  let items = records.map((record) =>
    mapListItem(
      record,
      subscriptionMap.get(record.subscription_id) ?? {
        subscription_id: record.subscription_id,
        reference: "Unknown subscription",
        status: "past_due",
        customer_name: "Unknown customer",
        product_title: "Unknown product",
        variant_title: "Unknown variant",
        sku: null,
        next_renewal_at: null,
        last_renewal_at: null,
        paused_at: null,
        cancelled_at: null,
        cancel_effective_at: null,
      }
    )
  )

  if (input.q) {
    items = items.filter((item) => matchesSearch(item, input.q!))
  }

  if (order && isInMemorySort) {
    items = sortItems(items, order, direction)
  }

  return {
    cancellations: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
  }
}

export async function getAdminCancellationDetail(
  container: MedusaContainer,
  id: string
): Promise<CancellationCaseAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "cancellation_case",
    fields: [...caseDetailFields],
    filters: {
      id: [id],
    },
  })

  const cancellationCase = (data as CancellationCaseRecord[])[0]

  if (!cancellationCase) {
    throw cancellationErrors.notFound("CancellationCase", id)
  }

  const [subscriptionMap, dunningMap, renewalMap, offers] = await Promise.all([
    getSubscriptionSummaryMap(container, [cancellationCase.subscription_id]),
    getActiveDunningSummaryMap(container, [cancellationCase.subscription_id]),
    getRenewalSummaryMap(container, [cancellationCase.subscription_id]),
    getOfferHistory(container, cancellationCase.id),
  ])

  const subscription = subscriptionMap.get(cancellationCase.subscription_id)

  if (!subscription) {
    throw cancellationErrors.notFound(
      "Subscription",
      cancellationCase.subscription_id
    )
  }

  const detail: CancellationCaseAdminDetail = {
    ...mapListItem(cancellationCase, subscription),
    notes: cancellationCase.notes,
    finalized_by: cancellationCase.finalized_by,
    cancellation_effective_at: cancellationCase.cancellation_effective_at,
    dunning: dunningMap.get(cancellationCase.subscription_id) ?? null,
    renewal: renewalMap.get(cancellationCase.subscription_id) ?? null,
    offers,
    metadata: cancellationCase.metadata,
  }

  return {
    cancellation: detail,
  }
}
