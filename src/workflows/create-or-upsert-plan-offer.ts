import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { upsertPlanOfferStep } from "./steps/upsert-plan-offer"
import type { UpsertPlanOfferInput } from "./steps/shared-plan-offer"

export const createOrUpsertPlanOfferWorkflow = createWorkflow(
  "create-or-upsert-plan-offer",
  function (input: UpsertPlanOfferInput) {
    const plan_offer_id = upsertPlanOfferStep(input)

    return new WorkflowResponse(plan_offer_id)
  }
)

export default createOrUpsertPlanOfferWorkflow
