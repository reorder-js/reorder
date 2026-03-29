import type { MedusaContainer } from "@medusajs/framework/types"
import { PLAN_OFFER_MODULE } from "../../src/modules/plan-offer"
import type PlanOfferModuleService from "../../src/modules/plan-offer/service"
import {
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
  PlanOfferStackingPolicy,
} from "../../src/modules/plan-offer/types"
import {
  createAdminAuthHeaders,
  createProductWithVariant,
} from "./subscription-fixtures"

type PlanOfferSeedInput = {
  id?: string
  name?: string
  scope?: PlanOfferScope
  product_id?: string
  variant_id?: string | null
  is_enabled?: boolean
  allowed_frequencies?: Array<{
    interval: PlanOfferFrequencyInterval
    value: number
  }>
  discount_per_frequency?: Array<{
    interval: PlanOfferFrequencyInterval
    value: number
    discount_type: PlanOfferDiscountType
    discount_value: number
  }> | null
  rules?: {
    minimum_cycles: number | null
    trial_enabled: boolean
    trial_days: number | null
    stacking_policy: PlanOfferStackingPolicy
  } | null
  metadata?: Record<string, unknown> | null
}

export { createAdminAuthHeaders, createProductWithVariant }

export async function createPlanOfferSeed(
  container: MedusaContainer,
  input: PlanOfferSeedInput = {}
) {
  const planOfferModule =
    container.resolve<PlanOfferModuleService>(PLAN_OFFER_MODULE)

  const allowedFrequencies = input.allowed_frequencies ?? [
    {
      interval: PlanOfferFrequencyInterval.MONTH,
      value: 1,
    },
  ]

  const created = await planOfferModule.createPlanOffers({
    id: input.id,
    name: input.name ?? `Plan Offer ${Date.now()}`,
    scope: input.scope ?? PlanOfferScope.PRODUCT,
    product_id: input.product_id ?? `prod_${Date.now()}`,
    variant_id:
      input.scope === PlanOfferScope.VARIANT
        ? input.variant_id ?? `variant_${Date.now()}`
        : (input.variant_id ?? null),
    is_enabled: input.is_enabled ?? true,
    allowed_frequencies: allowedFrequencies as any,
    frequency_intervals: [
      ...new Set(allowedFrequencies.map((frequency) => String(frequency.interval))),
    ],
    discount_per_frequency: (input.discount_per_frequency ?? []) as any,
    rules: input.rules ?? {
      minimum_cycles: 1,
      trial_enabled: false,
      trial_days: null,
      stacking_policy: PlanOfferStackingPolicy.ALLOWED,
    },
    metadata: input.metadata ?? null,
  } as any)

  return created
}
