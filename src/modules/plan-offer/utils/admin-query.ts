import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PlanOfferAdminDetail,
  PlanOfferAdminDetailResponse,
  PlanOfferAdminDiscountValue,
  PlanOfferAdminEffectiveConfigSummary,
  PlanOfferAdminFrequencyOption,
  PlanOfferAdminListItem,
  PlanOfferAdminListResponse,
  PlanOfferAdminRules,
  PlanOfferAdminStatus,
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope as AdminPlanOfferScope,
} from "../../../admin/types/plan-offer"
import type {
  PlanOfferAllowedFrequency,
  PlanOfferDiscountPerFrequency,
  PlanOfferRules,
  ProductSubscriptionConfig,
} from "../types"
import { PlanOfferScope as DomainPlanOfferScope } from "../types"
import { planOfferErrors } from "./errors"

export type ListAdminPlanOffersInput = {
  limit?: number
  offset?: number
  q?: string
  is_enabled?: boolean
  scope?: "product" | "variant"
  product_id?: string
  variant_id?: string
  frequency?: "week" | "month" | "year"
  order?: string
  direction?: "asc" | "desc"
}

type PlanOfferRecord = {
  id: string
  name: string
  scope: "product" | "variant"
  product_id: string
  variant_id: string | null
  is_enabled: boolean
  allowed_frequencies: PlanOfferAllowedFrequency[]
  frequency_intervals: string[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[] | null
  rules: PlanOfferRules | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ProductRecord = {
  id: string
  title: string
  variants?: Array<{
    id: string
    title: string
    sku?: string | null
  }>
}

type DisplayData = {
  product_title: string
  variant_title: string | null
  sku: string | null
}

const listFields = [
  "id",
  "name",
  "scope",
  "product_id",
  "variant_id",
  "is_enabled",
  "allowed_frequencies",
  "frequency_intervals",
  "discount_per_frequency",
  "rules",
  "created_at",
  "updated_at",
] as const

const detailFields = [
  ...listFields,
  "metadata",
] as const

const productFields = [
  "id",
  "title",
  "variants.id",
  "variants.title",
  "variants.sku",
] as const

const databaseSortableFields = new Set([
  "name",
  "scope",
  "is_enabled",
  "created_at",
  "updated_at",
])

const inMemorySortableFields = new Set([
  "status",
  "product_title",
  "variant_title",
])

function formatFrequencyLabel(interval: string, value: number) {
  if (value === 1) {
    return `Every ${interval}`
  }

  return `Every ${value} ${interval}s`
}

function mapFrequencyOption(
  frequency: PlanOfferAllowedFrequency
): PlanOfferAdminFrequencyOption {
  return {
    interval:
      frequency.interval === "week"
        ? PlanOfferFrequencyInterval.WEEK
        : frequency.interval === "month"
          ? PlanOfferFrequencyInterval.MONTH
          : PlanOfferFrequencyInterval.YEAR,
    value: frequency.value,
    label: formatFrequencyLabel(frequency.interval, frequency.value),
  }
}

function mapDiscountValue(
  discount: PlanOfferDiscountPerFrequency
): PlanOfferAdminDiscountValue {
  const label =
    discount.discount_type === "percentage"
      ? `${discount.discount_value}% off`
      : `${discount.discount_value} off`

  return {
    type:
      discount.discount_type === "percentage"
        ? PlanOfferDiscountType.PERCENTAGE
        : PlanOfferDiscountType.FIXED,
    value: discount.discount_value,
    label,
  }
}

function mapRules(rules: PlanOfferRules | null): PlanOfferAdminRules | null {
  if (!rules) {
    return null
  }

  return {
    minimum_cycles: rules.minimum_cycles,
    trial_enabled: rules.trial_enabled,
    trial_days: rules.trial_days,
    stacking_policy: rules.stacking_policy,
  }
}

function getRulesSummary(rules: PlanOfferRules | null) {
  if (!rules) {
    return null
  }

  const parts: string[] = []

  if (rules.minimum_cycles) {
    parts.push(`Min ${rules.minimum_cycles} cycles`)
  }

  if (rules.trial_enabled && rules.trial_days) {
    parts.push(`${rules.trial_days}-day trial`)
  }

  switch (rules.stacking_policy) {
    case "allowed":
      parts.push("Stacking allowed")
      break
    case "disallow_all":
      parts.push("No stacking")
      break
    case "disallow_subscription_discounts":
      parts.push("No subscription discount stacking")
      break
  }

  return parts.length ? parts.join(" · ") : null
}

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw planOfferErrors.invalidData(`Unsupported sort field '${order}'`)
  }
}

function buildFilters(input: ListAdminPlanOffersInput) {
  const filters: Record<string, unknown> = {}

  if (typeof input.is_enabled === "boolean") {
    filters.is_enabled = input.is_enabled
  }

  if (input.scope) {
    filters.scope = input.scope
  }

  if (input.product_id) {
    filters.product_id = input.product_id
  }

  if (input.variant_id) {
    filters.variant_id = input.variant_id
  }

  return filters
}

async function getDisplayDataMap(
  container: MedusaContainer,
  records: PlanOfferRecord[]
): Promise<Map<string, DisplayData>> {
  const productIds = [...new Set(records.map((record) => record.product_id))]

  if (!productIds.length) {
    return new Map()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [...productFields],
    filters: {
      id: productIds,
    },
  })

  const products = data as ProductRecord[]
  const productMap = new Map(products.map((product) => [product.id, product]))
  const displayMap = new Map<string, DisplayData>()

  for (const record of records) {
    const product = productMap.get(record.product_id)
    const variant = product?.variants?.find(
      (item) => item.id === record.variant_id
    )

    displayMap.set(record.id, {
      product_title: product?.title ?? "Unknown product",
      variant_title:
        record.scope === "product"
          ? "All variants"
          : variant?.title ?? "Unknown variant",
      sku: record.scope === "variant" ? variant?.sku ?? null : null,
    })
  }

  return displayMap
}

async function getActiveProductSourceMap(
  container: MedusaContainer,
  records: PlanOfferRecord[]
) {
  const productIds = [...new Set(records.map((record) => record.product_id))]

  if (!productIds.length) {
    return new Map<string, PlanOfferRecord>()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "plan_offer",
    fields: [...listFields],
    filters: {
      scope: "product",
      product_id: productIds,
      is_enabled: true,
    },
  })

  const productRecords = data as PlanOfferRecord[]

  return new Map(
    productRecords.map((record) => [record.product_id, record])
  )
}

function mapRecordToEffectiveConfig(
  record: PlanOfferRecord
): ProductSubscriptionConfig {
  return {
    product_id: record.product_id,
    variant_id: record.variant_id,
    source_offer_id: record.id,
    source_scope:
      record.scope === "product"
        ? DomainPlanOfferScope.PRODUCT
        : DomainPlanOfferScope.VARIANT,
    is_enabled: true,
    allowed_frequencies: record.allowed_frequencies ?? [],
    discount_per_frequency: record.discount_per_frequency ?? [],
    rules: record.rules,
  }
}

function getInactiveEffectiveConfig(input: {
  product_id: string
  variant_id?: string | null
}): ProductSubscriptionConfig {
  return {
    product_id: input.product_id,
    variant_id: input.variant_id ?? null,
    source_offer_id: null,
    source_scope: null,
    is_enabled: false,
    allowed_frequencies: [],
    discount_per_frequency: [],
    rules: null,
  }
}

export async function resolveProductSubscriptionConfig(
  container: MedusaContainer,
  input: {
    product_id: string
    variant_id?: string | null
  }
): Promise<ProductSubscriptionConfig> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (input.variant_id) {
    const { data: variantData } = await query.graph({
      entity: "plan_offer",
      fields: [...listFields],
      filters: {
        scope: "variant",
        variant_id: input.variant_id,
        is_enabled: true,
      },
      pagination: {
        take: 1,
      },
    })

    const variantRecord = (variantData as PlanOfferRecord[])[0]

    if (variantRecord) {
      return mapRecordToEffectiveConfig(variantRecord)
    }
  }

  const { data: productData } = await query.graph({
    entity: "plan_offer",
    fields: [...listFields],
    filters: {
      scope: "product",
      product_id: input.product_id,
      is_enabled: true,
    },
    pagination: {
      take: 1,
    },
  })

  const productRecord = (productData as PlanOfferRecord[])[0]

  if (productRecord) {
    return {
      ...mapRecordToEffectiveConfig(productRecord),
      variant_id: input.variant_id ?? null,
    }
  }

  return getInactiveEffectiveConfig(input)
}

function mapEffectiveConfigSummary(
  config: ProductSubscriptionConfig
): PlanOfferAdminEffectiveConfigSummary {
  return {
    source_scope: config.source_scope,
    source_offer_id: config.source_offer_id,
    allowed_frequencies: config.allowed_frequencies.map(mapFrequencyOption),
    discounts: config.discount_per_frequency.map(mapDiscountValue),
    rules: mapRules(config.rules),
  }
}

async function mapListItem(
  record: PlanOfferRecord,
  displayData: DisplayData,
  effectiveConfig: ProductSubscriptionConfig
): Promise<PlanOfferAdminListItem> {
  return {
    id: record.id,
    name: record.name,
    status: record.is_enabled
      ? PlanOfferAdminStatus.ENABLED
      : PlanOfferAdminStatus.DISABLED,
    is_enabled: record.is_enabled,
    target: {
      scope:
        record.scope === "product"
          ? AdminPlanOfferScope.PRODUCT
          : AdminPlanOfferScope.VARIANT,
      product_id: record.product_id,
      product_title: displayData.product_title,
      variant_id: record.variant_id,
      variant_title: displayData.variant_title,
      sku: displayData.sku,
    },
    allowed_frequencies: (record.allowed_frequencies ?? []).map(
      mapFrequencyOption
    ),
    discounts: (record.discount_per_frequency ?? []).map(mapDiscountValue),
    rules_summary: getRulesSummary(record.rules),
    effective_config_summary: mapEffectiveConfigSummary(effectiveConfig),
    updated_at: record.updated_at,
  }
}

async function mapListItems(
  container: MedusaContainer,
  records: PlanOfferRecord[]
) {
  const displayMap = await getDisplayDataMap(container, records)
  const activeProductSourceMap = await getActiveProductSourceMap(
    container,
    records
  )

  return await Promise.all(
    records.map((record) => {
      const displayData = displayMap.get(record.id) ?? {
        product_title: "Unknown product",
        variant_title:
          record.scope === "product" ? "All variants" : "Unknown variant",
        sku: null,
      }

      const effectiveConfig =
        record.scope === "product"
          ? record.is_enabled
            ? mapRecordToEffectiveConfig(record)
            : getInactiveEffectiveConfig({
                product_id: record.product_id,
              })
          : record.is_enabled
            ? mapRecordToEffectiveConfig(record)
            : activeProductSourceMap.has(record.product_id)
              ? {
                  ...mapRecordToEffectiveConfig(
                    activeProductSourceMap.get(record.product_id)!
                  ),
                  variant_id: record.variant_id,
                }
              : getInactiveEffectiveConfig({
                  product_id: record.product_id,
                  variant_id: record.variant_id,
                })

      return mapListItem(record, displayData, effectiveConfig)
    })
  )
}

function matchesSearch(item: PlanOfferAdminListItem, search: string) {
  const value = search.trim().toLowerCase()

  if (!value.length) {
    return true
  }

  return [
    item.name,
    item.target.product_title,
    item.target.variant_title ?? "",
    item.target.sku ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(value)
}

function matchesFrequency(item: PlanOfferAdminListItem, frequency?: string) {
  if (!frequency) {
    return true
  }

  return item.allowed_frequencies.some((item) => item.interval === frequency)
}

function getSortableValue(item: PlanOfferAdminListItem, order: string) {
  switch (order) {
    case "name":
      return item.name ?? ""
    case "scope":
      return item.target.scope ?? ""
    case "status":
      return item.status ?? ""
    case "product_title":
      return item.target.product_title ?? ""
    case "variant_title":
      return item.target.variant_title ?? ""
    case "created_at":
      return ""
    case "updated_at":
      return item.updated_at ?? ""
    default:
      return ""
  }
}

function sortItems(
  items: PlanOfferAdminListItem[],
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

export async function listAdminPlanOffers(
  container: MedusaContainer,
  input: ListAdminPlanOffersInput
): Promise<PlanOfferAdminListResponse> {
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
    Boolean(input.q) || Boolean(input.frequency) || isInMemorySort

  if (!requiresInMemoryProcessing) {
    const {
      data,
      metadata: { count = 0, take = limit, skip = offset } = {},
    } = await query.graph({
      entity: "plan_offer",
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
      plan_offers: await mapListItems(container, data as PlanOfferRecord[]),
      count,
      limit: take,
      offset: skip,
    }
  }

  const { data } = await query.graph({
    entity: "plan_offer",
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

  let items = await mapListItems(container, data as PlanOfferRecord[])

  if (input.q) {
    items = items.filter((item) => matchesSearch(item, input.q!))
  }

  if (input.frequency) {
    items = items.filter((item) => matchesFrequency(item, input.frequency))
  }

  if (order && isInMemorySort) {
    items = sortItems(items, order, direction)
  }

  return {
    plan_offers: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
  }
}

export async function getAdminPlanOfferDetail(
  container: MedusaContainer,
  id: string
): Promise<PlanOfferAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "plan_offer",
    fields: [...detailFields],
    filters: {
      id: [id],
    },
  })

  const record = (data as PlanOfferRecord[])[0]

  if (!record) {
    throw planOfferErrors.notFound("PlanOffer", id)
  }

  const displayMap = await getDisplayDataMap(container, [record])
  const listItem = await mapListItem(
    record,
    displayMap.get(record.id) ?? {
      product_title: "Unknown product",
      variant_title:
        record.scope === "product" ? "All variants" : "Unknown variant",
      sku: null,
    },
    await resolveProductSubscriptionConfig(container, {
      product_id: record.product_id,
      variant_id: record.scope === "variant" ? record.variant_id : undefined,
    })
  )

  const detail: PlanOfferAdminDetail = {
    ...listItem,
    created_at: record.created_at,
    metadata: record.metadata ?? null,
    rules: mapRules(record.rules),
  }

  return {
    plan_offer: detail,
  }
}
