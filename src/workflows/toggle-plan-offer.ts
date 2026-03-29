import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  togglePlanOfferStep,
  type TogglePlanOfferStepInput,
} from "./steps/toggle-plan-offer"

export const togglePlanOfferWorkflow = createWorkflow(
  "toggle-plan-offer",
  function (input: TogglePlanOfferStepInput) {
    const plan_offer_id = togglePlanOfferStep(input)

    return new WorkflowResponse(plan_offer_id)
  }
)

export default togglePlanOfferWorkflow
