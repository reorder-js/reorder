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
import {
  SubscriptionFrequencyInterval as SourceSubscriptionFrequencyInterval,
  type SubscriptionPaymentContext,
  type SubscriptionPaymentMethodSummary,
} from "../types"
import { getEffectiveNextRenewalAt } from "./effective-next-renewal"
import {
  listCustomerPaymentMethods,
  resolveCustomerPaymentMethod,
} from "./payment-methods"
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
  payment_context?: SubscriptionPaymentContext | null
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

type LiveCustomerRecord = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
}

type LiveProductRecord = {
  id: string
  title?: string | null
}

type LiveVariantRecord = {
  id: string
  title?: string | null
  sku?: string | null
  product?: {
    id?: string | null
    title?: string | null
  } | null
}

type SubscriptionDisplayData = {
  customer_name: string
  customer_email: string
  product_title: string
  variant_title: string
  sku: string | null
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
  "payment_context",
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

function mapListItem(
  record: SubscriptionRecord,
  displayData?: SubscriptionDisplayData
): SubscriptionAdminListItem {
  const fallbackCustomer = record.customer_snapshot ?? {}
  const fallbackProduct = record.product_snapshot ?? {}
  const customerName =
    displayData?.customer_name ??
    fallbackCustomer.full_name ??
    "Unknown customer"
  const customerEmail =
    displayData?.customer_email ??
    fallbackCustomer.email ??
    ""
  const productTitle =
    displayData?.product_title ??
    fallbackProduct.product_title ??
    "Unknown product"
  const variantTitle =
    displayData?.variant_title ??
    fallbackProduct.variant_title ??
    "Unknown variant"
  const sku = displayData?.sku ?? fallbackProduct.sku ?? null

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
      full_name: customerName,
      email: customerEmail,
    },
    product: {
      product_id: record.product_id,
      product_title: productTitle,
      variant_id: record.variant_id,
      variant_title: variantTitle,
      sku,
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

function mapDetail(
  record: SubscriptionRecord,
  displayData?: SubscriptionDisplayData
): SubscriptionAdminDetail {
  return {
    ...mapListItem(record, displayData),
    created_at: record.created_at,
    started_at: record.started_at,
    paused_at: record.paused_at,
    cancelled_at: record.cancelled_at,
    last_renewal_at: record.last_renewal_at,
    shipping_address: record.shipping_address,
    pending_update_data: mapPendingUpdateData(record.pending_update_data),
    initial_order: null,
    renewal_orders: [],
    payment_provider_id: record.payment_context?.payment_provider_id ?? null,
    payment_method: null,
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

function buildCustomerDisplayName(customer?: LiveCustomerRecord | null) {
  if (!customer) {
    return null
  }

  const fullName = [customer.first_name, customer.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim()

  return fullName || null
}

async function getSubscriptionDisplayDataMap(
  container: MedusaContainer,
  records: SubscriptionRecord[]
): Promise<Map<string, SubscriptionDisplayData>> {
  if (!records.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const customerIds = [...new Set(records.map((record) => record.customer_id))]
  const productIds = [...new Set(records.map((record) => record.product_id))]
  const variantIds = [...new Set(records.map((record) => record.variant_id))]

  const [customersResult, productsResult, variantsResult] = await Promise.all([
    customerIds.length
      ? query.graph({
          entity: "customer",
          fields: ["id", "email", "first_name", "last_name"],
          filters: {
            id: customerIds,
          },
        })
      : Promise.resolve({ data: [] }),
    productIds.length
      ? query.graph({
          entity: "product",
          fields: ["id", "title"],
          filters: {
            id: productIds,
          },
        })
      : Promise.resolve({ data: [] }),
    variantIds.length
      ? query.graph({
          entity: "variant",
          fields: ["id", "title", "sku", "product.id", "product.title"],
          filters: {
            id: variantIds,
          },
        })
      : Promise.resolve({ data: [] }),
  ])

  const customers = new Map(
    ((customersResult.data ?? []) as LiveCustomerRecord[]).map((customer) => [
      customer.id,
      customer,
    ])
  )
  const products = new Map(
    ((productsResult.data ?? []) as LiveProductRecord[]).map((product) => [
      product.id,
      product,
    ])
  )
  const variants = new Map(
    ((variantsResult.data ?? []) as LiveVariantRecord[]).map((variant) => [
      variant.id,
      variant,
    ])
  )

  return new Map(
    records.map((record) => {
      const fallbackCustomer = record.customer_snapshot ?? {}
      const fallbackProduct = record.product_snapshot ?? {}
      const customer = customers.get(record.customer_id)
      const product = products.get(record.product_id)
      const variant = variants.get(record.variant_id)

      return [
        record.id,
        {
          customer_name:
            buildCustomerDisplayName(customer) ??
            fallbackCustomer.full_name ??
            "Unknown customer",
          customer_email:
            customer?.email ??
            fallbackCustomer.email ??
            "",
          product_title:
            product?.title ??
            variant?.product?.title ??
            fallbackProduct.product_title ??
            "Unknown product",
          variant_title:
            variant?.title ??
            fallbackProduct.variant_title ??
            "Unknown variant",
          sku: variant?.sku ?? fallbackProduct.sku ?? null,
        },
      ]
    })
  )
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

    const records = data as SubscriptionRecord[]
    const displayDataMap = await getSubscriptionDisplayDataMap(container, records)

    return {
      subscriptions: records.map((record) =>
        mapListItem(record, displayDataMap.get(record.id))
      ),
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

  const records = data as SubscriptionRecord[]
  const displayDataMap = await getSubscriptionDisplayDataMap(container, records)
  let items = records.map((record) =>
    mapListItem(record, displayDataMap.get(record.id))
  )

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

  const displayDataMap = await getSubscriptionDisplayDataMap(container, [
    subscription,
  ])

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

  const paymentContext = (subscription.payment_context ??
    null) as SubscriptionPaymentContext | null

  return {
    subscription: {
      ...mapDetail(subscription, displayDataMap.get(subscription.id)),
      initial_order: initialOrder,
      renewal_orders: renewalOrders,
      payment_provider_id: paymentContext?.payment_provider_id ?? null,
      payment_method: await resolveSubscriptionPaymentMethodSummary(container, {
        customer_id: subscription.customer_id,
        payment_context: paymentContext,
      }),
    },
  }
}

/**
 * Resolves the card details of the payment method a subscription renews with.
 *
 * Best effort: a removed payment method or an unreachable payment provider must
 * not break the Admin subscription detail view.
 */
export async function resolveSubscriptionPaymentMethodSummary(
  container: MedusaContainer,
  input: {
    customer_id: string
    payment_context: SubscriptionPaymentContext | null
  }
): Promise<SubscriptionPaymentMethodSummary | null> {
  const providerId = input.payment_context?.payment_provider_id ?? null
  const paymentMethodId =
    input.payment_context?.payment_method_reference ?? null

  if (!providerId || !paymentMethodId) {
    return null
  }

  try {
    const resolved = await resolveCustomerPaymentMethod(container, {
      customer_id: input.customer_id,
      provider_id: providerId,
      payment_method_id: paymentMethodId,
    })

    return resolved.summary
  } catch {
    return null
  }
}

/**
 * Lists the payment methods the subscription's customer can renew with, marking
 * the one currently stored on the subscription.
 */
export async function getAdminSubscriptionPaymentMethods(
  container: MedusaContainer,
  id: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "subscription",
    fields: ["id", "customer_id", "payment_context"],
    filters: {
      id: [id],
    },
  })

  const subscription = (data as SubscriptionRecord[])[0]

  if (!subscription) {
    throw subscriptionErrors.notFound("Subscription", id)
  }

  const paymentContext = (subscription.payment_context ??
    null) as SubscriptionPaymentContext | null
  const providerId = paymentContext?.payment_provider_id ?? null
  const currentPaymentMethodId =
    paymentContext?.payment_method_reference ?? null
  const paymentMethods = await listCustomerPaymentMethods(container, {
    customer_id: subscription.customer_id,
    provider_id: providerId,
  })

  return {
    payment_provider_id: providerId,
    payment_methods: paymentMethods.map((paymentMethod) => ({
      ...paymentMethod,
      is_current: paymentMethod.id === currentPaymentMethodId,
    })),
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
