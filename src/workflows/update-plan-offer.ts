import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updatePlanOfferStep,
  type UpdatePlanOfferStepInput,
} from "./steps/update-plan-offer"

export const updatePlanOfferWorkflow = createWorkflow(
  "update-plan-offer",
  function (input: UpdatePlanOfferStepInput) {
    const plan_offer_id = updatePlanOfferStep(input)

    return new WorkflowResponse(plan_offer_id)
  }
)

export default updatePlanOfferWorkflow
