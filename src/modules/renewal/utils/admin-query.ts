import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  RenewalApprovalStatus as AdminRenewalApprovalStatus,
  RenewalAdminApprovalSummary,
  RenewalAdminOrderSummary,
  RenewalAdminPendingChangeSummary,
  RenewalAdminSubscriptionSummary,
  RenewalAttemptAdminRecord,
  RenewalAttemptAdminStatus,
  RenewalCycleAdminDetail,
  RenewalCycleAdminDetailResponse,
  RenewalCycleAdminListItem,
  RenewalCycleAdminListResponse,
  RenewalCycleAdminStatus,
} from "../../../admin/types/renewal"
import {
  RenewalApprovalStatus,
  RenewalAppliedPendingUpdateData,
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../types"
import { SubscriptionFrequencyInterval } from "../../subscription/types"
import { getEffectiveNextRenewalAt } from "../../subscription/utils/effective-next-renewal"
import { renewalErrors } from "./errors"

export type ListAdminRenewalsInput = {
  limit?: number
  offset?: number
  order?: string
  direction?: "asc" | "desc"
  q?: string
  status?: string[]
  approval_status?: string[]
  scheduled_from?: string
  scheduled_to?: string
  last_attempt_status?: string[]
  subscription_id?: string
  generated_order_id?: string
}

type RenewalCycleRecord = {
  id: string
  subscription_id: string
  scheduled_for: string
  processed_at: string | null
  status: "scheduled" | "processing" | "succeeded" | "failed"
  approval_required: boolean
  approval_status: "pending" | "approved" | "rejected" | null
  approval_decided_at: string | null
  approval_decided_by: string | null
  approval_reason: string | null
  generated_order_id: string | null
  applied_pending_update_data: RenewalAppliedPendingUpdateData | null
  last_error: string | null
  attempt_count: number
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type RenewalAttemptRecord = {
  id: string
  renewal_cycle_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: "processing" | "succeeded" | "failed"
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  order_id: string | null
  metadata: Record<string, unknown> | null
}

type SubscriptionRecord = {
  id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  next_renewal_at: string | null
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  skip_next_cycle: boolean
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string
    variant_title?: string
    sku?: string | null
  } | null
}

type OrderRecord = {
  id: string
  display_id: number | string
  status: string
}

type LatestAttemptSummary = {
  status: RenewalAttemptAdminStatus
  at: string | null
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

const cycleListFields = [
  "id",
  "subscription_id",
  "scheduled_for",
  "processed_at",
  "status",
  "approval_required",
  "approval_status",
  "approval_decided_at",
  "approval_decided_by",
  "approval_reason",
  "generated_order_id",
  "last_error",
  "attempt_count",
  "created_at",
  "updated_at",
] as const

const cycleDetailFields = [
  ...cycleListFields,
  "applied_pending_update_data",
  "metadata",
] as const

const attemptFields = [
  "id",
  "renewal_cycle_id",
  "attempt_no",
  "started_at",
  "finished_at",
  "status",
  "error_code",
  "error_message",
  "payment_reference",
  "order_id",
  "metadata",
] as const

const subscriptionFields = [
  "id",
  "reference",
  "status",
  "next_renewal_at",
  "frequency_interval",
  "frequency_value",
  "skip_next_cycle",
  "customer_snapshot",
  "product_snapshot",
] as const

type RenewalAdminSubscriptionProjection = {
  summary: RenewalAdminSubscriptionSummary
  next_renewal_at: string | null
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  skip_next_cycle: boolean
}

const orderFields = [
  "id",
  "display_id",
  "status",
] as const

const databaseSortableFields = new Set([
  "scheduled_for",
  "updated_at",
  "created_at",
  "status",
  "approval_status",
  "processed_at",
])

const inMemorySortableFields = new Set([
  "last_attempt_status",
  "subscription_reference",
  "customer_name",
  "product_title",
  "order_display_id",
])

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw renewalErrors.invalidData(`Unsupported sort field '${order}'`)
  }
}

function mapCycleStatus(status: RenewalCycleRecord["status"]) {
  switch (status) {
    case RenewalCycleStatus.SCHEDULED:
      return RenewalCycleAdminStatus.SCHEDULED
    case RenewalCycleStatus.PROCESSING:
      return RenewalCycleAdminStatus.PROCESSING
    case RenewalCycleStatus.SUCCEEDED:
      return RenewalCycleAdminStatus.SUCCEEDED
    case RenewalCycleStatus.FAILED:
      return RenewalCycleAdminStatus.FAILED
  }

  throw renewalErrors.invalidData(`Unsupported renewal cycle status '${status}'`)
}

function mapAttemptStatus(status: RenewalAttemptRecord["status"]) {
  switch (status) {
    case RenewalAttemptStatus.PROCESSING:
      return RenewalAttemptAdminStatus.PROCESSING
    case RenewalAttemptStatus.SUCCEEDED:
      return RenewalAttemptAdminStatus.SUCCEEDED
    case RenewalAttemptStatus.FAILED:
      return RenewalAttemptAdminStatus.FAILED
  }

  throw renewalErrors.invalidData(
    `Unsupported renewal attempt status '${status}'`
  )
}

function mapApprovalStatus(
  status: RenewalCycleRecord["approval_status"]
): AdminRenewalApprovalStatus | null {
  switch (status) {
    case RenewalApprovalStatus.PENDING:
      return AdminRenewalApprovalStatus.PENDING
    case RenewalApprovalStatus.APPROVED:
      return AdminRenewalApprovalStatus.APPROVED
    case RenewalApprovalStatus.REJECTED:
      return AdminRenewalApprovalStatus.REJECTED
    default:
      return null
  }
}

function mapApprovalSummary(
  record: RenewalCycleRecord
): RenewalAdminApprovalSummary {
  return {
    required: record.approval_required,
    status: mapApprovalStatus(record.approval_status),
    decided_at: record.approval_decided_at,
    decided_by: record.approval_decided_by,
    reason: record.approval_reason,
  }
}

function mapPendingChanges(
  value: RenewalAppliedPendingUpdateData | null
): RenewalAdminPendingChangeSummary | null {
  if (!value) {
    return null
  }

  return {
    variant_id: value.variant_id,
    variant_title: value.variant_title,
    frequency_interval: value.frequency_interval,
    frequency_value: value.frequency_value,
    effective_at: value.effective_at,
  }
}

async function getLatestAttemptMap(
  container: MedusaContainer,
  cycleIds: string[]
): Promise<Map<string, LatestAttemptSummary>> {
  if (!cycleIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "renewal_attempt",
    fields: [...attemptFields],
    filters: {
      renewal_cycle_id: cycleIds,
    },
  })

  const map = new Map<string, RenewalAttemptRecord>()

  for (const record of data as RenewalAttemptRecord[]) {
    const current = map.get(record.renewal_cycle_id)

    if (!current || record.attempt_no > current.attempt_no) {
      map.set(record.renewal_cycle_id, record)
    }
  }

  return new Map(
    [...map.entries()].map(([cycleId, record]) => [
      cycleId,
      {
        status: mapAttemptStatus(record.status),
        at: record.finished_at ?? record.started_at,
      },
    ])
  )
}

async function getSubscriptionSummaryMap(
  container: MedusaContainer,
  subscriptionIds: string[]
): Promise<Map<string, RenewalAdminSubscriptionProjection>> {
  if (!subscriptionIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "subscription",
    fields: [...subscriptionFields],
    filters: {
      id: subscriptionIds,
    },
  })

  const records = data as SubscriptionRecord[]

  return new Map(
    records.map((record) => [
      record.id,
      {
        summary: {
          subscription_id: record.id,
          reference: record.reference,
          status: record.status,
          customer_name:
            record.customer_snapshot?.full_name ?? "Unknown customer",
          product_title:
            record.product_snapshot?.product_title ?? "Unknown product",
          variant_title:
            record.product_snapshot?.variant_title ?? "Unknown variant",
          sku: record.product_snapshot?.sku ?? null,
        },
        next_renewal_at: record.next_renewal_at,
        frequency_interval: record.frequency_interval,
        frequency_value: record.frequency_value,
        skip_next_cycle: record.skip_next_cycle,
      },
    ])
  )
}

function getEffectiveScheduledFor(
  cycle: RenewalCycleRecord,
  subscriptionProjection: RenewalAdminSubscriptionProjection | undefined
) {
  if (!subscriptionProjection) {
    return cycle.scheduled_for
  }

  const isUpcomingOperationalCycle =
    cycle.status === RenewalCycleStatus.SCHEDULED &&
    toTimestamp(subscriptionProjection.next_renewal_at) ===
      toTimestamp(cycle.scheduled_for)

  if (!isUpcomingOperationalCycle || !subscriptionProjection.skip_next_cycle) {
    return cycle.scheduled_for
  }

  return (
    getEffectiveNextRenewalAt({
      next_renewal_at: subscriptionProjection.next_renewal_at,
      skip_next_cycle: subscriptionProjection.skip_next_cycle,
      frequency_interval:
        subscriptionProjection.frequency_interval as SubscriptionFrequencyInterval,
      frequency_value: subscriptionProjection.frequency_value,
    })?.toISOString() ?? cycle.scheduled_for
  )
}

async function getOrderSummaryMap(
  container: MedusaContainer,
  orderIds: string[]
): Promise<Map<string, RenewalAdminOrderSummary>> {
  if (!orderIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [...orderFields],
    filters: {
      id: orderIds,
    },
  })

  const records = data as OrderRecord[]

  return new Map(
    records.map((record) => [
      record.id,
      {
        order_id: record.id,
        display_id: record.display_id,
        status: record.status,
      },
    ])
  )
}

async function mapRenewalListItems(
  container: MedusaContainer,
  records: RenewalCycleRecord[]
): Promise<RenewalCycleAdminListItem[]> {
  const latestAttemptMap = await getLatestAttemptMap(
    container,
    records.map((record) => record.id)
  )
  const subscriptionSummaryMap = await getSubscriptionSummaryMap(
    container,
    [...new Set(records.map((record) => record.subscription_id))]
  )
  const orderSummaryMap = await getOrderSummaryMap(
    container,
    [
      ...new Set(
        records
          .map((record) => record.generated_order_id)
          .filter((value): value is string => Boolean(value))
      ),
    ]
  )

  return records.map((record) => {
    const latestAttempt = latestAttemptMap.get(record.id)
    const subscriptionProjection = subscriptionSummaryMap.get(record.subscription_id)
    const subscriptionSummary = subscriptionProjection?.summary
    const effectiveScheduledFor = getEffectiveScheduledFor(
      record,
      subscriptionProjection
    )

    return {
      id: record.id,
      status: mapCycleStatus(record.status),
      subscription:
        subscriptionSummary ?? {
          subscription_id: record.subscription_id,
          reference: "Unknown subscription",
          status: "past_due",
          customer_name: "Unknown customer",
          product_title: "Unknown product",
          variant_title: "Unknown variant",
          sku: null,
        },
      scheduled_for: record.scheduled_for,
      effective_scheduled_for: effectiveScheduledFor,
      last_attempt_status: latestAttempt?.status ?? null,
      last_attempt_at: latestAttempt?.at ?? null,
      approval: mapApprovalSummary(record),
      generated_order: record.generated_order_id
        ? orderSummaryMap.get(record.generated_order_id) ?? null
        : null,
      updated_at: record.updated_at,
    }
  })
}

function matchesSearch(item: RenewalCycleAdminListItem, search: string) {
  const value = search.trim().toLowerCase()

  if (!value.length) {
    return true
  }

  return [
    item.subscription.reference,
    item.subscription.customer_name,
    item.subscription.product_title,
    item.subscription.variant_title,
    item.generated_order?.display_id?.toString() ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(value)
}

function matchesLastAttemptStatus(
  item: RenewalCycleAdminListItem,
  statuses?: string[]
) {
  if (!statuses?.length) {
    return true
  }

  if (!item.last_attempt_status) {
    return false
  }

  return statuses.includes(item.last_attempt_status)
}

function getSortableValue(item: RenewalCycleAdminListItem, order: string) {
  switch (order) {
    case "scheduled_for":
      return item.scheduled_for ?? ""
    case "updated_at":
      return item.updated_at ?? ""
    case "status":
      return item.status ?? ""
    case "approval_status":
      return item.approval.status ?? ""
    case "last_attempt_status":
      return item.last_attempt_status ?? ""
    case "subscription_reference":
      return item.subscription.reference ?? ""
    case "customer_name":
      return item.subscription.customer_name ?? ""
    case "product_title":
      return item.subscription.product_title ?? ""
    case "order_display_id":
      return item.generated_order?.display_id?.toString() ?? ""
    default:
      return ""
  }
}

function sortItems(
  items: RenewalCycleAdminListItem[],
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

function buildFilters(input: ListAdminRenewalsInput) {
  const filters: Record<string, unknown> = {}

  if (input.status?.length) {
    filters.status = input.status
  }

  if (input.approval_status?.length) {
    filters.approval_status = input.approval_status
  }

  if (input.subscription_id) {
    filters.subscription_id = input.subscription_id
  }

  if (input.generated_order_id) {
    filters.generated_order_id = input.generated_order_id
  }

  if (input.scheduled_from || input.scheduled_to) {
    filters.scheduled_for = {
      ...(input.scheduled_from ? { $gte: input.scheduled_from } : {}),
      ...(input.scheduled_to ? { $lte: input.scheduled_to } : {}),
    }
  }

  return filters
}

export async function listRenewalAttemptsForCycle(
  container: MedusaContainer,
  renewalCycleId: string
): Promise<RenewalAttemptAdminRecord[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "renewal_attempt",
    fields: [...attemptFields],
    filters: {
      renewal_cycle_id: [renewalCycleId],
    },
    pagination: {
      order: {
        attempt_no: "ASC",
      },
    },
  })

  return (data as RenewalAttemptRecord[]).map((record) => ({
    id: record.id,
    attempt_no: record.attempt_no,
    status: mapAttemptStatus(record.status),
    started_at: record.started_at,
    finished_at: record.finished_at,
    error_code: record.error_code,
    error_message: record.error_message,
    payment_reference: record.payment_reference,
    order_id: record.order_id,
  }))
}

export async function listAdminRenewals(
  container: MedusaContainer,
  input: ListAdminRenewalsInput
): Promise<RenewalCycleAdminListResponse> {
  assertSortableField(input.order)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters = buildFilters(input)
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const direction = input.direction ?? "desc"
  const order = input.order
  const isInMemorySort =
    typeof order === "string" && inMemorySortableFields.has(order)
  const requiresInMemoryProcessing =
    Boolean(input.q) ||
    Boolean(input.last_attempt_status?.length) ||
    isInMemorySort

  if (!requiresInMemoryProcessing) {
    const {
      data,
      metadata: { count = 0, take = limit, skip = offset } = {},
    } = await query.graph({
      entity: "renewal_cycle",
      fields: [...cycleListFields],
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

    return {
      renewals: await mapRenewalListItems(
        container,
        data as RenewalCycleRecord[]
      ),
      count,
      limit: take,
      offset: skip,
    }
  }

  const { data } = await query.graph({
    entity: "renewal_cycle",
    fields: [...cycleListFields],
    filters,
    pagination: order && databaseSortableFields.has(order)
      ? {
          order: {
            [order]: direction.toUpperCase(),
          },
        }
      : undefined,
  })

  let items = await mapRenewalListItems(container, data as RenewalCycleRecord[])

  if (input.q) {
    items = items.filter((item) => matchesSearch(item, input.q!))
  }

  if (input.last_attempt_status?.length) {
    items = items.filter((item) =>
      matchesLastAttemptStatus(item, input.last_attempt_status)
    )
  }

  if (order && isInMemorySort) {
    items = sortItems(items, order, direction)
  }

  return {
    renewals: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
  }
}

export async function getAdminRenewalDetail(
  container: MedusaContainer,
  id: string
): Promise<RenewalCycleAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "renewal_cycle",
    fields: [...cycleDetailFields],
    filters: {
      id: [id],
    },
  })

  const record = (data as RenewalCycleRecord[])[0]

  if (!record) {
    throw renewalErrors.notFound("RenewalCycle", id)
  }

  const listItem = (
    await mapRenewalListItems(container, [record])
  )[0]
  const attempts = await listRenewalAttemptsForCycle(container, id)

  const detail: RenewalCycleAdminDetail = {
    ...listItem,
    created_at: record.created_at,
    processed_at: record.processed_at,
    last_error: record.last_error,
    pending_changes: mapPendingChanges(record.applied_pending_update_data),
    attempts,
    metadata: record.metadata ?? null,
  }

  return {
    renewal: detail,
  }
}
