import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  DunningAttemptAdminStatus,
  DunningCaseAdminListItem,
  DunningCaseAdminListResponse,
  DunningCaseAdminDetail,
  DunningCaseAdminDetailResponse,
  DunningCaseAdminStatus,
} from "../../../admin/types/dunning"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../types"
import { dunningErrors } from "./errors"

type DunningCaseRecord = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: string | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: string | null
  recovered_at: string | null
  closed_at: string | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type DunningAttemptRecord = {
  id: string
  dunning_case_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: DunningAttemptStatus
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  metadata: Record<string, unknown> | null
}

type SubscriptionRecord = {
  id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string
    variant_title?: string
    sku?: string | null
  } | null
}

type RenewalCycleRecord = {
  id: string
  status: "scheduled" | "processing" | "succeeded" | "failed"
  scheduled_for: string
  generated_order_id: string | null
}

type OrderRecord = {
  id: string
  display_id: number | string
  status: string
}

export type ListAdminDunningCasesInput = {
  limit?: number
  offset?: number
  order?: string
  direction?: "asc" | "desc"
  q?: string
  status?: string[]
  subscription_id?: string
  renewal_cycle_id?: string
  renewal_order_id?: string
  next_retry_from?: string
  next_retry_to?: string
  last_attempt_status?: string[]
}

const listFields = [
  "id",
  "subscription_id",
  "renewal_cycle_id",
  "renewal_order_id",
  "status",
  "attempt_count",
  "max_attempts",
  "next_retry_at",
  "last_payment_error_code",
  "last_attempt_at",
  "updated_at",
] as const

const detailFields = [
  "id",
  "subscription_id",
  "renewal_cycle_id",
  "renewal_order_id",
  "status",
  "attempt_count",
  "max_attempts",
  "retry_schedule",
  "next_retry_at",
  "last_payment_error_code",
  "last_payment_error_message",
  "last_attempt_at",
  "recovered_at",
  "closed_at",
  "recovery_reason",
  "metadata",
  "created_at",
  "updated_at",
] as const

const attemptFields = [
  "id",
  "dunning_case_id",
  "attempt_no",
  "started_at",
  "finished_at",
  "status",
  "error_code",
  "error_message",
  "payment_reference",
  "metadata",
] as const

const databaseSortableFields = new Set([
  "updated_at",
  "status",
  "next_retry_at",
  "attempt_count",
  "max_attempts",
  "last_attempt_at",
])

const inMemorySortableFields = new Set([
  "last_attempt_status",
  "subscription_reference",
  "customer_name",
  "product_title",
  "order_display_id",
])

function mapCaseStatus(status: DunningCaseRecord["status"]) {
  switch (status) {
    case DunningCaseStatus.OPEN:
      return DunningCaseAdminStatus.OPEN
    case DunningCaseStatus.RETRY_SCHEDULED:
      return DunningCaseAdminStatus.RETRY_SCHEDULED
    case DunningCaseStatus.RETRYING:
      return DunningCaseAdminStatus.RETRYING
    case DunningCaseStatus.AWAITING_MANUAL_RESOLUTION:
      return DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION
    case DunningCaseStatus.RECOVERED:
      return DunningCaseAdminStatus.RECOVERED
    case DunningCaseStatus.UNRECOVERED:
      return DunningCaseAdminStatus.UNRECOVERED
  }

  throw dunningErrors.invalidData(`Unsupported dunning case status '${status}'`)
}

function mapAttemptStatus(status: DunningAttemptRecord["status"]) {
  switch (status) {
    case DunningAttemptStatus.PROCESSING:
      return DunningAttemptAdminStatus.PROCESSING
    case DunningAttemptStatus.SUCCEEDED:
      return DunningAttemptAdminStatus.SUCCEEDED
    case DunningAttemptStatus.FAILED:
      return DunningAttemptAdminStatus.FAILED
  }

  throw dunningErrors.invalidData(
    `Unsupported dunning attempt status '${status}'`
  )
}

function mapListItem(
  record: DunningCaseRecord,
  subscription: SubscriptionRecord | null,
  renewal: RenewalCycleRecord | null,
  order: OrderRecord | null,
  lastAttemptStatus: DunningAttemptAdminStatus | null
): DunningCaseAdminListItem {
  return {
    id: record.id,
    status: mapCaseStatus(record.status),
    subscription: {
      subscription_id: record.subscription_id,
      reference: subscription?.reference ?? "Unknown subscription",
      status: subscription?.status ?? "past_due",
      customer_name: subscription?.customer_snapshot?.full_name ?? "Unknown customer",
      product_title:
        subscription?.product_snapshot?.product_title ?? "Unknown product",
      variant_title:
        subscription?.product_snapshot?.variant_title ?? "Unknown variant",
      sku: subscription?.product_snapshot?.sku ?? null,
    },
    renewal: renewal
      ? {
          renewal_cycle_id: renewal.id,
          status: renewal.status,
          scheduled_for: renewal.scheduled_for,
          generated_order_id: renewal.generated_order_id,
        }
      : null,
    order: order
      ? {
          order_id: order.id,
          display_id: order.display_id,
          status: order.status,
        }
      : null,
    attempt_count: record.attempt_count,
    max_attempts: record.max_attempts,
    next_retry_at: record.next_retry_at,
    last_attempt_at: record.last_attempt_at,
    last_payment_error_code: record.last_payment_error_code,
    updated_at: record.updated_at,
  }
}

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw dunningErrors.invalidData(`Unsupported sort field '${order}'`)
  }
}

function buildFilters(input: ListAdminDunningCasesInput) {
  const filters: Record<string, unknown> = {}

  if (input.status?.length) {
    filters.status = input.status
  }

  if (input.subscription_id) {
    filters.subscription_id = input.subscription_id
  }

  if (input.renewal_cycle_id) {
    filters.renewal_cycle_id = input.renewal_cycle_id
  }

  if (input.renewal_order_id) {
    filters.renewal_order_id = input.renewal_order_id
  }

  if (input.next_retry_from || input.next_retry_to) {
    filters.next_retry_at = {
      ...(input.next_retry_from ? { $gte: input.next_retry_from } : {}),
      ...(input.next_retry_to ? { $lte: input.next_retry_to } : {}),
    }
  }

  return filters
}

async function getLastAttemptStatusMap(
  container: MedusaContainer,
  dunningCaseIds: string[]
) {
  if (!dunningCaseIds.length) {
    return new Map<string, DunningAttemptAdminStatus>()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "dunning_attempt",
    fields: [...attemptFields],
    filters: {
      dunning_case_id: dunningCaseIds,
    },
  })

  const latest = new Map<string, DunningAttemptRecord>()

  for (const record of data as DunningAttemptRecord[]) {
    const current = latest.get(record.dunning_case_id)

    if (!current || record.attempt_no > current.attempt_no) {
      latest.set(record.dunning_case_id, record)
    }
  }

  return new Map(
    [...latest.entries()].map(([key, value]) => [key, mapAttemptStatus(value.status)])
  )
}

async function getSubscriptionMap(
  container: MedusaContainer,
  subscriptionIds: string[]
) {
  if (!subscriptionIds.length) {
    return new Map<string, SubscriptionRecord>()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "subscription",
    fields: [
      "id",
      "reference",
      "status",
      "customer_snapshot",
      "product_snapshot",
    ],
    filters: {
      id: subscriptionIds,
    },
  })

  return new Map((data as SubscriptionRecord[]).map((record) => [record.id, record]))
}

async function getRenewalMap(
  container: MedusaContainer,
  renewalCycleIds: string[]
) {
  if (!renewalCycleIds.length) {
    return new Map<string, RenewalCycleRecord>()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "renewal_cycle",
    fields: [
      "id",
      "status",
      "scheduled_for",
      "generated_order_id",
    ],
    filters: {
      id: renewalCycleIds,
    },
  })

  return new Map((data as RenewalCycleRecord[]).map((record) => [record.id, record]))
}

async function getOrderMap(container: MedusaContainer, orderIds: string[]) {
  if (!orderIds.length) {
    return new Map<string, OrderRecord>()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status"],
    filters: {
      id: orderIds,
    },
  })

  return new Map((data as OrderRecord[]).map((record) => [record.id, record]))
}

async function mapListItems(
  container: MedusaContainer,
  records: DunningCaseRecord[]
) {
  const [lastAttemptStatusMap, subscriptionMap, renewalMap, orderMap] =
    await Promise.all([
      getLastAttemptStatusMap(container, records.map((record) => record.id)),
      getSubscriptionMap(
        container,
        [...new Set(records.map((record) => record.subscription_id))]
      ),
      getRenewalMap(
        container,
        [...new Set(records.map((record) => record.renewal_cycle_id))]
      ),
      getOrderMap(
        container,
        [
          ...new Set(
            records
              .map((record) => record.renewal_order_id)
              .filter((value): value is string => Boolean(value))
          ),
        ]
      ),
    ])

  return records.map((record) =>
    mapListItem(
      record,
      subscriptionMap.get(record.subscription_id) ?? null,
      renewalMap.get(record.renewal_cycle_id) ?? null,
      record.renewal_order_id
        ? orderMap.get(record.renewal_order_id) ?? null
        : null,
      lastAttemptStatusMap.get(record.id) ?? null
    )
  )
}

function matchesSearch(item: DunningCaseAdminListItem, search: string) {
  const value = search.trim().toLowerCase()

  if (!value.length) {
    return true
  }

  return [
    item.subscription.reference,
    item.subscription.customer_name,
    item.subscription.product_title,
    item.subscription.variant_title,
    item.order?.display_id?.toString() ?? "",
    item.last_payment_error_code ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(value)
}

function matchesLastAttemptStatus(
  item: DunningCaseAdminListItem,
  statuses?: string[],
  lastAttemptStatusMap?: Map<string, DunningAttemptAdminStatus>
) {
  if (!statuses?.length || !lastAttemptStatusMap) {
    return true
  }

  const status = lastAttemptStatusMap.get(item.id)

  if (!status) {
    return false
  }

  return statuses.includes(status)
}

function getSortableValue(item: DunningCaseAdminListItem, order: string) {
  switch (order) {
    case "updated_at":
      return item.updated_at ?? ""
    case "status":
      return item.status ?? ""
    case "next_retry_at":
      return item.next_retry_at ?? ""
    case "attempt_count":
      return item.attempt_count ?? 0
    case "max_attempts":
      return item.max_attempts ?? 0
    case "last_attempt_at":
      return item.last_attempt_at ?? ""
    case "subscription_reference":
      return item.subscription.reference ?? ""
    case "customer_name":
      return item.subscription.customer_name ?? ""
    case "product_title":
      return item.subscription.product_title ?? ""
    case "order_display_id":
      return item.order?.display_id?.toString() ?? ""
    default:
      return ""
  }
}

function sortItems(
  items: DunningCaseAdminListItem[],
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

export async function listAdminDunningCases(
  container: MedusaContainer,
  input: ListAdminDunningCasesInput
): Promise<DunningCaseAdminListResponse> {
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
    Boolean(input.q) || Boolean(input.last_attempt_status?.length) || isInMemorySort

  if (!requiresInMemoryProcessing) {
    const {
      data,
      metadata: { count = 0, take = limit, skip = offset } = {},
    } = await query.graph({
      entity: "dunning_case",
      fields: [...listFields],
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
      dunning_cases: await mapListItems(container, data as DunningCaseRecord[]),
      count,
      limit: take,
      offset: skip,
    }
  }

  const { data } = await query.graph({
    entity: "dunning_case",
    fields: [...listFields],
    filters,
    pagination: order && databaseSortableFields.has(order)
      ? {
          order: {
            [order]: direction.toUpperCase(),
          },
        }
      : undefined,
  })

  let items = await mapListItems(container, data as DunningCaseRecord[])
  const lastAttemptStatusMap = await getLastAttemptStatusMap(
    container,
    items.map((item) => item.id)
  )

  if (input.q) {
    items = items.filter((item) => matchesSearch(item, input.q!))
  }

  if (input.last_attempt_status?.length) {
    items = items.filter((item) =>
      matchesLastAttemptStatus(item, input.last_attempt_status, lastAttemptStatusMap)
    )
  }

  if (order && isInMemorySort) {
    items = sortItems(items, order, direction)
  }

  return {
    dunning_cases: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
  }
}

export async function getAdminDunningDetail(
  container: MedusaContainer,
  id: string
): Promise<DunningCaseAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "dunning_case",
    fields: [...detailFields],
    filters: {
      id: [id],
    },
  })

  const dunningCase = (data as DunningCaseRecord[])[0]

  if (!dunningCase) {
    throw dunningErrors.notFound("DunningCase", id)
  }

  const [{ data: attemptsData }, { data: subscriptionsData }, { data: renewalsData }] =
    await Promise.all([
      query.graph({
        entity: "dunning_attempt",
        fields: [...attemptFields],
        filters: {
          dunning_case_id: [dunningCase.id],
        },
      }),
      query.graph({
        entity: "subscription",
        fields: [
          "id",
          "reference",
          "status",
          "customer_snapshot",
          "product_snapshot",
        ],
        filters: {
          id: [dunningCase.subscription_id],
        },
      }),
      query.graph({
        entity: "renewal_cycle",
        fields: [
          "id",
          "status",
          "scheduled_for",
          "generated_order_id",
        ],
        filters: {
          id: [dunningCase.renewal_cycle_id],
        },
      }),
    ])

  const attempts = (attemptsData as DunningAttemptRecord[]).sort(
    (left, right) => left.attempt_no - right.attempt_no
  )
  const subscription = (subscriptionsData as SubscriptionRecord[])[0]
  const renewal = (renewalsData as RenewalCycleRecord[])[0] ?? null

  if (!subscription) {
    throw dunningErrors.notFound("Subscription", dunningCase.subscription_id)
  }

  let order: OrderRecord | null = null

  if (dunningCase.renewal_order_id) {
    const { data: ordersData } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status"],
      filters: {
        id: [dunningCase.renewal_order_id],
      },
    })

    order = (ordersData as OrderRecord[])[0] ?? null
  }

  const detail: DunningCaseAdminDetail = {
    id: dunningCase.id,
    status: mapCaseStatus(dunningCase.status),
    subscription: {
      subscription_id: subscription.id,
      reference: subscription.reference,
      status: subscription.status,
      customer_name: subscription.customer_snapshot?.full_name ?? "Unknown customer",
      product_title:
        subscription.product_snapshot?.product_title ?? "Unknown product",
      variant_title:
        subscription.product_snapshot?.variant_title ?? "Unknown variant",
      sku: subscription.product_snapshot?.sku ?? null,
    },
    renewal: renewal
      ? {
          renewal_cycle_id: renewal.id,
          status: renewal.status,
          scheduled_for: renewal.scheduled_for,
          generated_order_id: renewal.generated_order_id,
        }
      : null,
    order: order
      ? {
          order_id: order.id,
          display_id: order.display_id,
          status: order.status,
        }
      : null,
    attempt_count: dunningCase.attempt_count,
    max_attempts: dunningCase.max_attempts,
    retry_schedule: dunningCase.retry_schedule,
    next_retry_at: dunningCase.next_retry_at,
    last_payment_error_code: dunningCase.last_payment_error_code,
    last_payment_error_message: dunningCase.last_payment_error_message,
    last_attempt_at: dunningCase.last_attempt_at,
    recovered_at: dunningCase.recovered_at,
    closed_at: dunningCase.closed_at,
    recovery_reason: dunningCase.recovery_reason,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      attempt_no: attempt.attempt_no,
      status: mapAttemptStatus(attempt.status),
      started_at: attempt.started_at,
      finished_at: attempt.finished_at,
      error_code: attempt.error_code,
      error_message: attempt.error_message,
      payment_reference: attempt.payment_reference,
      metadata: attempt.metadata,
    })),
    metadata: dunningCase.metadata,
    created_at: dunningCase.created_at,
    updated_at: dunningCase.updated_at,
  }

  return {
    dunning_case: detail,
  }
}
