import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type {
  PlanOfferAllowedFrequency,
  PlanOfferDiscountPerFrequency,
  PlanOfferRules,
} from "../../modules/plan-offer/types"
import {
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
  PlanOfferStackingPolicy,
} from "../../modules/plan-offer/types"
import { planOfferErrors } from "../../modules/plan-offer/utils/errors"

export type UpsertPlanOfferInput = {
  name: string
  scope: PlanOfferScope | "product" | "variant"
  product_id: string
  variant_id?: string | null
  is_enabled: boolean
  allowed_frequencies: Array<{
    interval: PlanOfferFrequencyInterval | "week" | "month" | "year"
    value: number
  }>
  discounts?: Array<{
    interval: PlanOfferFrequencyInterval | "week" | "month" | "year"
    frequency_value: number
    type: PlanOfferDiscountType | "percentage" | "fixed"
    value: number
  }> | null
  rules?: {
    minimum_cycles: number | null
    trial_enabled: boolean
    trial_days: number | null
    stacking_policy:
      | PlanOfferStackingPolicy
      | "allowed"
      | "disallow_all"
      | "disallow_subscription_discounts"
  } | null
  metadata?: Record<string, unknown> | null
}

export type PlanOfferRecord = {
  id: string
  name: string
  scope: PlanOfferScope
  product_id: string
  variant_id: string | null
  is_enabled: boolean
  allowed_frequencies: PlanOfferAllowedFrequency[]
  frequency_intervals: string[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[] | null
  rules: PlanOfferRules | null
  metadata: Record<string, unknown> | null
}

export type PlanOfferCreatePayload = {
  name: string
  scope: PlanOfferScope
  product_id: string
  variant_id: string | null
  is_enabled: boolean
  allowed_frequencies: PlanOfferAllowedFrequency[]
  frequency_intervals: string[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[]
  rules: PlanOfferRules | null
  metadata: Record<string, unknown> | null
}

export type PlanOfferUpdatePayload = PlanOfferCreatePayload & {
  id: string
}

export type UpsertPlanOfferCompensation = {
  created_id: string | null
  previous: PlanOfferUpdatePayload | null
}

type ProductRecord = {
  id: string
  variants?: Array<{
    id: string
  }>
}

const planOfferFields = [
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
  "metadata",
] as const

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw planOfferErrors.invalidData(
      `'${field}' must be a positive integer`
    )
  }
}

function validateTarget(input: UpsertPlanOfferInput) {
  if (normalizeScope(input.scope) === PlanOfferScope.PRODUCT) {
    if (input.variant_id) {
      throw planOfferErrors.invalidData(
        "Product-scoped offers can't specify 'variant_id'"
      )
    }

    return
  }

  if (!input.variant_id) {
    throw planOfferErrors.invalidData(
      "Variant-scoped offers require 'variant_id'"
    )
  }
}

function normalizeScope(
  scope: UpsertPlanOfferInput["scope"]
): PlanOfferScope {
  switch (scope) {
    case "variant":
    case PlanOfferScope.VARIANT:
      return PlanOfferScope.VARIANT
    case "product":
    case PlanOfferScope.PRODUCT:
      return PlanOfferScope.PRODUCT
  }
}

function normalizeFrequencyInterval(
  interval: UpsertPlanOfferInput["allowed_frequencies"][number]["interval"]
): PlanOfferFrequencyInterval {
  switch (interval) {
    case "week":
    case PlanOfferFrequencyInterval.WEEK:
      return PlanOfferFrequencyInterval.WEEK
    case "month":
    case PlanOfferFrequencyInterval.MONTH:
      return PlanOfferFrequencyInterval.MONTH
    case "year":
    case PlanOfferFrequencyInterval.YEAR:
      return PlanOfferFrequencyInterval.YEAR
  }
}

function normalizeDiscountType(
  type: NonNullable<UpsertPlanOfferInput["discounts"]>[number]["type"]
): PlanOfferDiscountType {
  switch (type) {
    case "fixed":
    case PlanOfferDiscountType.FIXED:
      return PlanOfferDiscountType.FIXED
    case "percentage":
    case PlanOfferDiscountType.PERCENTAGE:
      return PlanOfferDiscountType.PERCENTAGE
  }
}

function normalizeStackingPolicy(
  stackingPolicy: NonNullable<UpsertPlanOfferInput["rules"]>["stacking_policy"]
): PlanOfferStackingPolicy {
  switch (stackingPolicy) {
    case "allowed":
    case PlanOfferStackingPolicy.ALLOWED:
      return PlanOfferStackingPolicy.ALLOWED
    case "disallow_all":
    case PlanOfferStackingPolicy.DISALLOW_ALL:
      return PlanOfferStackingPolicy.DISALLOW_ALL
    case "disallow_subscription_discounts":
    case PlanOfferStackingPolicy.DISALLOW_SUBSCRIPTION_DISCOUNTS:
      return PlanOfferStackingPolicy.DISALLOW_SUBSCRIPTION_DISCOUNTS
  }
}

function normalizeAllowedFrequencies(
  allowedFrequencies: UpsertPlanOfferInput["allowed_frequencies"]
): PlanOfferAllowedFrequency[] {
  if (!allowedFrequencies.length) {
    throw planOfferErrors.invalidData(
      "'allowed_frequencies' must contain at least one frequency"
    )
  }

  const seen = new Set<string>()

  return allowedFrequencies.map((frequency) => {
    assertPositiveInteger(
      frequency.value,
      `allowed_frequencies.${frequency.interval}.value`
    )

    const key = `${frequency.interval}:${frequency.value}`

    if (seen.has(key)) {
      throw planOfferErrors.invalidData(
        `Duplicate frequency '${key}' is not allowed`
      )
    }

    seen.add(key)

    return {
      interval: normalizeFrequencyInterval(frequency.interval),
      value: frequency.value,
    }
  })
}

function normalizeDiscounts(
  discounts: UpsertPlanOfferInput["discounts"],
  allowedFrequencies: PlanOfferAllowedFrequency[]
): PlanOfferDiscountPerFrequency[] {
  if (!discounts?.length) {
    return [] satisfies PlanOfferDiscountPerFrequency[]
  }

  const allowedFrequencyKeys = new Set(
    allowedFrequencies.map((frequency) => `${frequency.interval}:${frequency.value}`)
  )
  const seen = new Set<string>()

  return discounts.map((discount) => {
    assertPositiveInteger(
      discount.frequency_value,
      `discounts.${discount.interval}.frequency_value`
    )

    const frequencyKey = `${discount.interval}:${discount.frequency_value}`

    if (!allowedFrequencyKeys.has(frequencyKey)) {
      throw planOfferErrors.invalidData(
        `Discount frequency '${frequencyKey}' is not allowed`
      )
    }

    if (seen.has(frequencyKey)) {
      throw planOfferErrors.invalidData(
        `Duplicate discount for frequency '${frequencyKey}' is not allowed`
      )
    }

    seen.add(frequencyKey)

    if (normalizeDiscountType(discount.type) === PlanOfferDiscountType.PERCENTAGE) {
      if (discount.value <= 0 || discount.value > 100) {
        throw planOfferErrors.invalidData(
          "Percentage discounts must be greater than 0 and at most 100"
        )
      }
    } else if (discount.value <= 0) {
      throw planOfferErrors.invalidData(
        "Fixed discounts must be greater than 0"
      )
    }

    return {
      interval: normalizeFrequencyInterval(discount.interval),
      value: discount.frequency_value,
      discount_type: normalizeDiscountType(discount.type),
      discount_value: discount.value,
    }
  })
}

function normalizeRules(
  rules: UpsertPlanOfferInput["rules"]
): PlanOfferRules | null {
  if (rules === undefined || rules === null) {
    return null
  }

  if (rules.minimum_cycles !== null && rules.minimum_cycles !== undefined) {
    assertPositiveInteger(rules.minimum_cycles, "rules.minimum_cycles")
  }

  if (!rules.trial_enabled) {
    if (rules.trial_days !== null && rules.trial_days !== undefined) {
      throw planOfferErrors.invalidData(
        "'rules.trial_days' must be null when trial is disabled"
      )
    }
  } else {
    if (rules.trial_days === null || rules.trial_days === undefined) {
      throw planOfferErrors.invalidData(
        "'rules.trial_days' is required when trial is enabled"
      )
    }

    assertPositiveInteger(rules.trial_days, "rules.trial_days")
  }

  return {
    minimum_cycles: rules.minimum_cycles ?? null,
    trial_enabled: rules.trial_enabled,
    trial_days: rules.trial_days ?? null,
    stacking_policy: normalizeStackingPolicy(rules.stacking_policy),
  }
}

export async function assertPlanOfferTargetExists(
  container: MedusaContainer,
  input: Pick<UpsertPlanOfferInput, "product_id" | "variant_id" | "scope">
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id"],
    filters: {
      id: [input.product_id],
    },
  })

  const product = (data as ProductRecord[])[0]

  if (!product) {
    throw planOfferErrors.invalidData(
      `Product '${input.product_id}' was not found`
    )
  }

  if (normalizeScope(input.scope) === PlanOfferScope.VARIANT) {
    const variantId = input.variant_id!

    if (!product.variants?.some((variant) => variant.id === variantId)) {
      throw planOfferErrors.invalidData(
        `Variant '${variantId}' does not belong to product '${input.product_id}'`
      )
    }
  }
}

export async function findPlanOfferByTarget(
  container: MedusaContainer,
  input: Pick<UpsertPlanOfferInput, "scope" | "product_id" | "variant_id">
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters =
    normalizeScope(input.scope) === PlanOfferScope.PRODUCT
      ? {
          scope: PlanOfferScope.PRODUCT,
          product_id: input.product_id,
        }
      : {
          scope: PlanOfferScope.VARIANT,
          variant_id: input.variant_id!,
        }

  const { data } = await query.graph({
    entity: "plan_offer",
    fields: [...planOfferFields],
    filters,
    pagination: {
      take: 1,
    },
  })

  const record = (data as Array<Omit<PlanOfferRecord, "scope"> & {
    scope: "product" | "variant"
  }>)[0]

  if (!record) {
    return null
  }

  return {
    ...record,
    scope:
      record.scope === "product"
        ? PlanOfferScope.PRODUCT
        : PlanOfferScope.VARIANT,
  } satisfies PlanOfferRecord
}

export async function getPlanOfferRecordById(
  container: MedusaContainer,
  id: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "plan_offer",
    fields: [...planOfferFields],
    filters: {
      id: [id],
    },
    pagination: {
      take: 1,
    },
  })

  const record = (data as Array<Omit<PlanOfferRecord, "scope"> & {
    scope: "product" | "variant"
  }>)[0]

  if (!record) {
    return null
  }

  return {
    ...record,
    scope:
      record.scope === "product"
        ? PlanOfferScope.PRODUCT
        : PlanOfferScope.VARIANT,
  } satisfies PlanOfferRecord
}

export function normalizePlanOfferPayload(
  input: UpsertPlanOfferInput
): PlanOfferCreatePayload {
  validateTarget(input)
  const normalizedScope = normalizeScope(input.scope)

  const allowed_frequencies = normalizeAllowedFrequencies(input.allowed_frequencies)
  const discount_per_frequency = normalizeDiscounts(
    input.discounts,
    allowed_frequencies
  )
  const rules = normalizeRules(input.rules)

  return {
    name: input.name.trim(),
    scope: normalizedScope,
    product_id: input.product_id,
    variant_id: normalizedScope === PlanOfferScope.PRODUCT ? null : input.variant_id!,
    is_enabled: input.is_enabled,
    allowed_frequencies,
    frequency_intervals: [
      ...new Set(allowed_frequencies.map((frequency) => String(frequency.interval))),
    ],
    discount_per_frequency,
    rules,
    metadata: input.metadata ?? null,
  }
}

export function getPlanOfferId(
  result: { id?: string } | { id?: string }[] | undefined | null
): string | undefined {
  if (Array.isArray(result)) {
    return result[0]?.id
  }

  return result?.id
}

export function toUpdatePlanOfferServiceInput(
  record: PlanOfferRecord
): PlanOfferUpdatePayload {
  return {
    id: record.id,
    name: record.name,
    scope: record.scope,
    product_id: record.product_id,
    variant_id: record.variant_id,
    is_enabled: record.is_enabled,
    allowed_frequencies: record.allowed_frequencies,
    frequency_intervals: record.frequency_intervals,
    discount_per_frequency: record.discount_per_frequency ?? [],
    rules: record.rules,
    metadata: record.metadata,
  }
}
