import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  applyRetentionOfferStep,
  type ApplyRetentionOfferStepInput,
} from "./steps/apply-retention-offer"

export const applyRetentionOfferWorkflow = createWorkflow(
  "apply-retention-offer",
  function (input: ApplyRetentionOfferStepInput) {
    const result = applyRetentionOfferStep(input)

    return new WorkflowResponse(result)
  }
)

export default applyRetentionOfferWorkflow
