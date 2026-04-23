import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminOrderSubscriptionSummary,
  AdminOrderSubscriptionSummaryResponse,
  SubscriptionAdminDetail,
  SubscriptionAdminDetailResponse,
  SubscriptionAdminDiscount,
  SubscriptionAdminFrequency,
  SubscriptionAdminListItem,
  SubscriptionAdminListResponse,
  SubscriptionAdminOrderSummary,
  SubscriptionAdminPendingPlanChange,
  SubscriptionAdminShippingAddress,
  SubscriptionAdminStatus,
  SubscriptionDiscountType,
  SubscriptionFrequencyInterval,
} from "../../../admin/types/subscription"
import { SubscriptionFrequencyInterval as SourceSubscriptionFrequencyInterval } from "../types"
import { getEffectiveNextRenewalAt } from "./effective-next-renewal"
import { subscriptionErrors } from "./errors"

export type ListAdminSubscriptionsInput = {
  limit?: number
  offset?: number
  order?: string
  direction?: "asc" | "desc"
  q?: string
  status?: string[]
  customer_id?: string
  product_id?: string
  variant_id?: string
  next_renewal_from?: string
  next_renewal_to?: string
  is_trial?: boolean
  skip_next_cycle?: boolean
}

type SubscriptionRecord = {
  id: string
  reference: string
  status: string
  customer_id: string
  product_id: string
  variant_id: string
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  started_at: string
  next_renewal_at: string | null
  last_renewal_at: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_effective_at: string | null
  skip_next_cycle: boolean
  is_trial: boolean
  trial_ends_at: string | null
  customer_snapshot: {
    email?: string
    full_name?: string | null
  } | null
  product_snapshot: {
    product_id?: string
    product_title?: string
    variant_id?: string
    variant_title?: string
    sku?: string | null
  } | null
  pricing_snapshot: {
    discount_type?: "percentage" | "fixed"
    discount_value?: number
    label?: string | null
  } | null
  shipping_address: SubscriptionAdminShippingAddress
  pending_update_data: {
    variant_id: string
    variant_title: string
    sku: string | null
    frequency_interval: "week" | "month" | "year"
    frequency_value: number
    effective_at: string | null
    requested_at: string
    requested_by: string | null
  } | null
  created_at: string
  updated_at: string
}

type SubscriptionOrderLinkRecord = {
  subscription?: {
    id?: string | null
    reference?: string | null
    status?: string | null
    frequency_interval?: "week" | "month" | "year" | null
    frequency_value?: number | null
    next_renewal_at?: string | null
    skip_next_cycle?: boolean | null
    pricing_snapshot?: {
      discount_type?: "percentage" | "fixed"
      discount_value?: number
      label?: string | null
    } | null
  } | null
  order?: {
    id?: string | null
    display_id?: number | null
    status?: string | null
    created_at?: string | null
  } | null
}

type RenewalCycleRecord = {
  id: string
  subscription_id: string
  generated_order_id: string | null
}

type OrderRecord = {
  id: string
  display_id: number | null
  status: string
  created_at: string | null
}

const listFields = [
  "id",
  "reference",
  "status",
  "customer_id",
  "product_id",
  "variant_id",
  "frequency_interval",
  "frequency_value",
  "next_renewal_at",
  "last_renewal_at",
  "paused_at",
  "cancelled_at",
  "skip_next_cycle",
  "is_trial",
  "trial_ends_at",
  "customer_snapshot",
  "product_snapshot",
  "pricing_snapshot",
  "created_at",
  "updated_at",
] as const

const detailFields = [
  ...listFields,
  "started_at",
  "cancel_effective_at",
  "shipping_address",
  "pending_update_data",
  "metadata",
] as const

const databaseSortableFields = new Set([
  "created_at",
  "updated_at",
  "status",
  "frequency_interval",
  "frequency_value",
  "next_renewal_at",
  "trial_ends_at",
  "skip_next_cycle",
])

const inMemorySortableFields = new Set([
  "customer_name",
  "customer_email",
  "product_title",
  "variant_title",
  "discount_value",
])

function formatFrequencyLabel(interval: string, value: number) {
  if (value === 1) {
    return `Every ${interval}`
  }

  return `Every ${value} ${interval}s`
}

function mapDiscount(
  pricingSnapshot: SubscriptionRecord["pricing_snapshot"]
): SubscriptionAdminDiscount | null {
  if (
    !pricingSnapshot ||
    !pricingSnapshot.discount_type ||
    pricingSnapshot.discount_value === undefined
  ) {
    return null
  }

  const label =
    pricingSnapshot.label ??
    (pricingSnapshot.discount_type === "percentage"
      ? `${pricingSnapshot.discount_value}% off`
      : `${pricingSnapshot.discount_value} off`)

  return {
    type:
      pricingSnapshot.discount_type === "percentage"
        ? SubscriptionDiscountType.PERCENTAGE
        : SubscriptionDiscountType.FIXED,
    value: pricingSnapshot.discount_value,
    label,
  }
}

function mapPendingUpdateData(
  pendingUpdateData: SubscriptionRecord["pending_update_data"]
): SubscriptionAdminPendingPlanChange | null {
  if (!pendingUpdateData) {
    return null
  }

  return {
    variant_id: pendingUpdateData.variant_id,
    variant_title: pendingUpdateData.variant_title,
    frequency_interval:
      pendingUpdateData.frequency_interval === "week"
        ? SubscriptionFrequencyInterval.WEEK
        : pendingUpdateData.frequency_interval === "month"
          ? SubscriptionFrequencyInterval.MONTH
          : SubscriptionFrequencyInterval.YEAR,
    frequency_value: pendingUpdateData.frequency_value,
    effective_at: pendingUpdateData.effective_at,
  }
}

function mapListItem(record: SubscriptionRecord): SubscriptionAdminListItem {
  const customer = record.customer_snapshot ?? {}
  const product = record.product_snapshot ?? {}

  const frequency: SubscriptionAdminFrequency = {
    interval:
      record.frequency_interval === "week"
        ? SubscriptionFrequencyInterval.WEEK
        : record.frequency_interval === "month"
          ? SubscriptionFrequencyInterval.MONTH
          : SubscriptionFrequencyInterval.YEAR,
    value: record.frequency_value,
    label: formatFrequencyLabel(
      record.frequency_interval,
      record.frequency_value
    ),
  }

  return {
    id: record.id,
    reference: record.reference,
    status:
      record.status === "active"
        ? SubscriptionAdminStatus.ACTIVE
        : record.status === "paused"
          ? SubscriptionAdminStatus.PAUSED
          : record.status === "cancelled"
            ? SubscriptionAdminStatus.CANCELLED
            : SubscriptionAdminStatus.PAST_DUE,
    customer: {
      id: record.customer_id,
      full_name: customer.full_name ?? "Unknown customer",
      email: customer.email ?? "",
    },
    product: {
      product_id: record.product_id,
      product_title: product.product_title ?? "Unknown product",
      variant_id: record.variant_id,
      variant_title: product.variant_title ?? "Unknown variant",
      sku: product.sku ?? null,
    },
    frequency,
    next_renewal_at: record.next_renewal_at,
    effective_next_renewal_at:
      getEffectiveNextRenewalAt({
        next_renewal_at: record.next_renewal_at,
        skip_next_cycle: record.skip_next_cycle,
        frequency_interval:
          record.frequency_interval as SourceSubscriptionFrequencyInterval,
        frequency_value: record.frequency_value,
      })?.toISOString() ?? null,
    trial: {
      is_trial: record.is_trial,
      trial_ends_at: record.trial_ends_at,
    },
    discount: mapDiscount(record.pricing_snapshot),
    skip_next_cycle: record.skip_next_cycle,
    updated_at: record.updated_at,
  }
}

function mapDetail(record: SubscriptionRecord): SubscriptionAdminDetail {
  return {
    ...mapListItem(record),
    created_at: record.created_at,
    started_at: record.started_at,
    paused_at: record.paused_at,
    cancelled_at: record.cancelled_at,
    last_renewal_at: record.last_renewal_at,
    shipping_address: record.shipping_address,
    pending_update_data: mapPendingUpdateData(record.pending_update_data),
    initial_order: null,
    renewal_orders: [],
  }
}

function mapSubscriptionStatus(status: string | null | undefined) {
  return status === "active"
    ? SubscriptionAdminStatus.ACTIVE
    : status === "paused"
      ? SubscriptionAdminStatus.PAUSED
      : status === "cancelled"
        ? SubscriptionAdminStatus.CANCELLED
        : SubscriptionAdminStatus.PAST_DUE
}

function mapOrderSummary(
  record:
    | {
        id?: string | null
        display_id?: number | null
        status?: string | null
        created_at?: string | null
      }
    | null
    | undefined
): SubscriptionAdminOrderSummary | null {
  if (!record?.id || !record.status) {
    return null
  }

  return {
    order_id: record.id,
    display_id: record.display_id ?? null,
    status: record.status,
    created_at: record.created_at ?? null,
  }
}

function mapOrderSubscriptionSummary(
  record: SubscriptionOrderLinkRecord["subscription"]
): AdminOrderSubscriptionSummary {
  if (
    !record?.id ||
    !record.reference ||
    !record.frequency_interval ||
    typeof record.frequency_value !== "number"
  ) {
    return {
      is_subscription_order: false,
      subscription: null,
    }
  }

  return {
    is_subscription_order: true,
    subscription: {
      id: record.id,
      reference: record.reference,
      status: mapSubscriptionStatus(record.status),
      frequency_label: formatFrequencyLabel(
        record.frequency_interval,
        record.frequency_value
      ),
      discount: mapDiscount(record.pricing_snapshot ?? null),
      next_renewal_at: record.next_renewal_at ?? null,
      effective_next_renewal_at:
        getEffectiveNextRenewalAt({
          next_renewal_at: record.next_renewal_at ?? null,
          skip_next_cycle: Boolean(record.skip_next_cycle),
          frequency_interval:
            record.frequency_interval as SourceSubscriptionFrequencyInterval,
          frequency_value: record.frequency_value,
        })?.toISOString() ?? null,
    },
  }
}

function buildFilters(input: ListAdminSubscriptionsInput) {
  const filters: Record<string, unknown> = {}

  if (input.status?.length) {
    filters.status = input.status
  }

  if (input.customer_id) {
    filters.customer_id = input.customer_id
  }

  if (input.product_id) {
    filters.product_id = input.product_id
  }

  if (input.variant_id) {
    filters.variant_id = input.variant_id
  }

  if (typeof input.is_trial === "boolean") {
    filters.is_trial = input.is_trial
  }

  if (typeof input.skip_next_cycle === "boolean") {
    filters.skip_next_cycle = input.skip_next_cycle
  }

  if (input.next_renewal_from || input.next_renewal_to) {
    filters.next_renewal_at = {
      ...(input.next_renewal_from ? { $gte: input.next_renewal_from } : {}),
      ...(input.next_renewal_to ? { $lte: input.next_renewal_to } : {}),
    }
  }

  return filters
}

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw subscriptionErrors.invalidData(
      `Unsupported sort field '${order}'`
    )
  }
}

function sortItems(
  items: SubscriptionAdminListItem[],
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

function getSortableValue(item: SubscriptionAdminListItem, order: string) {
  switch (order) {
    case "updated_at":
      return item.updated_at ?? ""
    case "status":
      return item.status ?? ""
    case "frequency_interval":
      return item.frequency.interval ?? ""
    case "frequency_value":
      return item.frequency.value ?? 0
    case "next_renewal_at":
      return item.next_renewal_at ?? ""
    case "trial_ends_at":
      return item.trial.trial_ends_at ?? ""
    case "skip_next_cycle":
      return item.skip_next_cycle ? 1 : 0
    case "customer_name":
      return item.customer.full_name ?? ""
    case "customer_email":
      return item.customer.email ?? ""
    case "product_title":
      return item.product.product_title ?? ""
    case "variant_title":
      return item.product.variant_title ?? ""
    case "discount_value":
      return item.discount?.value ?? 0
    default:
      return ""
  }
}

function matchesSearch(item: SubscriptionAdminListItem, search: string) {
  const value = search.trim().toLowerCase()

  if (!value.length) {
    return true
  }

  return [
    item.reference,
    item.customer.full_name,
    item.customer.email,
    item.product.product_title,
    item.product.variant_title,
    item.product.sku ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(value)
}

export async function listAdminSubscriptions(
  container: MedusaContainer,
  input: ListAdminSubscriptionsInput
): Promise<SubscriptionAdminListResponse> {
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
    Boolean(input.q) || isInMemorySort

  if (!requiresInMemoryProcessing) {
    const {
      data,
      metadata: { count = 0, take = limit, skip = offset } = {},
    } = await query.graph({
      entity: "subscription",
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
      subscriptions: (data as SubscriptionRecord[]).map(mapListItem),
      count,
      limit: take,
      offset: skip,
    }
  }

  const { data } = await query.graph({
    entity: "subscription",
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

  let items = (data as SubscriptionRecord[]).map(mapListItem)

  if (input.q) {
    items = items.filter((item) => matchesSearch(item, input.q!))
  }

  if (order && isInMemorySort) {
    items = sortItems(items, order, direction)
  }

  return {
    subscriptions: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
  }
}

export async function getAdminSubscriptionDetail(
  container: MedusaContainer,
  id: string
): Promise<SubscriptionAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "subscription",
    fields: [...detailFields],
    filters: {
      id: [id],
    },
  })

  const subscription = (data as SubscriptionRecord[])[0]

  if (!subscription) {
    throw subscriptionErrors.notFound("Subscription", id)
  }

  const [subscriptionOrderLinksResult, renewalCyclesResult] = await Promise.all([
    query.graph({
      entity: "subscription_order",
      fields: [
        "subscription.id",
        "order.id",
        "order.display_id",
        "order.status",
        "order.created_at",
      ],
      filters: {
        subscription_id: [id],
      },
    }),
    query.graph({
      entity: "renewal_cycle",
      fields: ["id", "subscription_id", "generated_order_id"],
      filters: {
        subscription_id: [id],
      },
    }),
  ])

  const renewalCycles = (renewalCyclesResult.data ?? []) as RenewalCycleRecord[]
  const renewalOrderIds = [
    ...new Set(
      renewalCycles
        .map((cycle) => cycle.generated_order_id)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ]

  const renewalOrdersResult = renewalOrderIds.length
    ? await query.graph({
        entity: "order",
        fields: ["id", "display_id", "status", "created_at"],
        filters: {
          id: renewalOrderIds,
        },
      })
    : { data: [] }

  const renewalOrdersById = new Map(
    ((renewalOrdersResult.data ?? []) as OrderRecord[]).map((order) => [
      order.id,
      mapOrderSummary(order),
    ])
  )

  const renewalOrders = renewalCycles
    .map((cycle) =>
      cycle.generated_order_id
        ? renewalOrdersById.get(cycle.generated_order_id) ?? null
        : null
    )
    .filter((order): order is SubscriptionAdminOrderSummary => Boolean(order))
    .sort((a, b) => {
      const left = a.created_at ? new Date(a.created_at).getTime() : 0
      const right = b.created_at ? new Date(b.created_at).getTime() : 0

      return right - left
    })

  const renewalOrderIdSet = new Set(renewalOrders.map((order) => order.order_id))

  const initialOrder =
    ((subscriptionOrderLinksResult.data ?? []) as SubscriptionOrderLinkRecord[])
      .map((record) => mapOrderSummary(record.order))
      .filter(
        (order): order is SubscriptionAdminOrderSummary =>
          order !== null && !renewalOrderIdSet.has(order.order_id)
      )
      .sort((a, b) => {
        const left = a.created_at ? new Date(a.created_at).getTime() : 0
        const right = b.created_at ? new Date(b.created_at).getTime() : 0

        return left - right
      })[0] ?? null

  return {
    subscription: {
      ...mapDetail(subscription),
      initial_order: initialOrder,
      renewal_orders: renewalOrders,
    },
  }
}

export async function getAdminOrderSubscriptionSummary(
  container: MedusaContainer,
  orderId: string
): Promise<AdminOrderSubscriptionSummaryResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "subscription_order",
    fields: [
      "subscription.id",
      "subscription.reference",
      "subscription.status",
      "subscription.frequency_interval",
      "subscription.frequency_value",
      "subscription.next_renewal_at",
      "subscription.skip_next_cycle",
      "subscription.pricing_snapshot",
      "order.id",
    ],
    filters: {
      order_id: [orderId],
    },
  })

  const link = ((data ?? []) as SubscriptionOrderLinkRecord[])[0]

  if (!link?.subscription) {
    return {
      summary: {
        is_subscription_order: false,
        subscription: null,
      },
    }
  }

  return {
    summary: mapOrderSubscriptionSummary(link.subscription),
  }
}
