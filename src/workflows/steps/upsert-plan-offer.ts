import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PLAN_OFFER_MODULE } from "../../modules/plan-offer"
import PlanOfferModuleService from "../../modules/plan-offer/service"
import {
  assertPlanOfferTargetExists,
  findPlanOfferByTarget,
  getPlanOfferId,
  normalizePlanOfferPayload,
  type UpsertPlanOfferInput,
  type UpsertPlanOfferCompensation,
  toUpdatePlanOfferServiceInput,
} from "./shared-plan-offer"

export const upsertPlanOfferStep = createStep<
  UpsertPlanOfferInput,
  string,
  UpsertPlanOfferCompensation
>(
  "upsert-plan-offer",
  async function (input: UpsertPlanOfferInput, { container }) {
    await assertPlanOfferTargetExists(container, input)

    const payload = normalizePlanOfferPayload(input)
    const existing = await findPlanOfferByTarget(container, input)

    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    if (existing) {
      const updated = await planOfferModuleService.updatePlanOffers({
        ...payload,
        id: existing.id,
      } as any)
      const planOfferId = getPlanOfferId(updated)

      if (!planOfferId) {
        throw new Error("Failed to resolve updated plan offer id")
      }

      return new StepResponse(planOfferId, {
        created_id: null,
        previous: toUpdatePlanOfferServiceInput(existing),
      } satisfies UpsertPlanOfferCompensation)
    }

    const created = await planOfferModuleService.createPlanOffers(
      payload as any
    )
    const planOfferId = getPlanOfferId(created)

    if (!planOfferId) {
      throw new Error("Failed to resolve created plan offer id")
    }

    return new StepResponse(planOfferId, {
      created_id: planOfferId,
      previous: null,
    } satisfies UpsertPlanOfferCompensation)
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const planOfferModuleService: PlanOfferModuleService =
      container.resolve(PLAN_OFFER_MODULE)

    if (compensation.created_id) {
      await planOfferModuleService.deletePlanOffers(compensation.created_id)
      return
    }

    if (compensation.previous) {
      await planOfferModuleService.updatePlanOffers(compensation.previous as any)
    }
  }
)
