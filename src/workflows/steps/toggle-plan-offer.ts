import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PLAN_OFFER_MODULE } from "../../modules/plan-offer"
import PlanOfferModuleService from "../../modules/plan-offer/service"
import { planOfferErrors } from "../../modules/plan-offer/utils/errors"
import {
  getPlanOfferId,
  getPlanOfferRecordById,
  toUpdatePlanOfferServiceInput,
} from "./shared-plan-offer"

export type TogglePlanOfferStepInput = {
  id: string
  is_enabled: boolean
}

export const togglePlanOfferStep = createStep<
  TogglePlanOfferStepInput,
  string,
  import("./shared-plan-offer").PlanOfferUpdatePayload
>(
  "toggle-plan-offer",
  async function (input: TogglePlanOfferStepInput, { container }) {
    const existing = await getPlanOfferRecordById(container, input.id)

    if (!existing) {
      throw planOfferErrors.notFound("PlanOffer", input.id)
    }

    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    const updated = await planOfferModuleService.updatePlanOffers({
      id: input.id,
      is_enabled: input.is_enabled,
    })
    const planOfferId = getPlanOfferId(updated)

    if (!planOfferId) {
      throw new Error("Failed to resolve toggled plan offer id")
    }

    return new StepResponse(planOfferId, toUpdatePlanOfferServiceInput(existing))
  },
  async function (existing, { container }) {
    if (!existing) {
      return
    }

    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    await planOfferModuleService.updatePlanOffers({
      id: existing.id,
      is_enabled: existing.is_enabled,
    } as any)
  }
)
