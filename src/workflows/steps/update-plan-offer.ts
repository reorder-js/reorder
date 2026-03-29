import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PLAN_OFFER_MODULE } from "../../modules/plan-offer"
import PlanOfferModuleService from "../../modules/plan-offer/service"
import { planOfferErrors } from "../../modules/plan-offer/utils/errors"
import {
  assertPlanOfferTargetExists,
  getPlanOfferId,
  getPlanOfferRecordById,
  normalizePlanOfferPayload,
  type UpsertPlanOfferInput,
  toUpdatePlanOfferServiceInput,
} from "./shared-plan-offer"

export type UpdatePlanOfferStepInput = {
  id: string
  name?: string
  is_enabled?: boolean
  allowed_frequencies?: UpsertPlanOfferInput["allowed_frequencies"]
  discounts?: UpsertPlanOfferInput["discounts"]
  rules?: UpsertPlanOfferInput["rules"]
  metadata?: Record<string, unknown> | null
}

export const updatePlanOfferStep = createStep<
  UpdatePlanOfferStepInput,
  string,
  import("./shared-plan-offer").PlanOfferUpdatePayload
>(
  "update-plan-offer",
  async function (input: UpdatePlanOfferStepInput, { container }) {
    const existing = await getPlanOfferRecordById(container, input.id)

    if (!existing) {
      throw planOfferErrors.notFound("PlanOffer", input.id)
    }

    const mergedInput: UpsertPlanOfferInput = {
      name: input.name ?? existing.name,
      scope: existing.scope,
      product_id: existing.product_id,
      variant_id: existing.variant_id,
      is_enabled: input.is_enabled ?? existing.is_enabled,
      allowed_frequencies:
        input.allowed_frequencies ?? existing.allowed_frequencies,
      discounts:
        input.discounts ??
        (existing.discount_per_frequency ?? []).map((discount) => ({
          interval: discount.interval,
          frequency_value: discount.value,
          type: discount.discount_type,
          value: discount.discount_value,
        })),
      rules:
        input.rules === undefined
          ? existing.rules
          : input.rules,
      metadata:
        input.metadata === undefined ? existing.metadata : input.metadata,
    }

    await assertPlanOfferTargetExists(container, mergedInput)

    const payload = normalizePlanOfferPayload(mergedInput)
    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    const updated = await planOfferModuleService.updatePlanOffers({
      ...payload,
      id: existing.id,
    } as any)
    const planOfferId = getPlanOfferId(updated)

    if (!planOfferId) {
      throw new Error("Failed to resolve updated plan offer id")
    }

    return new StepResponse(planOfferId, toUpdatePlanOfferServiceInput(existing))
  },
  async function (existing, { container }) {
    if (!existing) {
      return
    }

    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    await planOfferModuleService.updatePlanOffers(existing as any)
  }
)
