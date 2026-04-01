import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  smartCancellationStep,
  type SmartCancellationStepInput,
} from "./steps/smart-cancellation"

export const smartCancellationWorkflow = createWorkflow(
  "smart-cancellation",
  function (input: SmartCancellationStepInput) {
    const result = smartCancellationStep(input)

    return new WorkflowResponse(result)
  }
)

export default smartCancellationWorkflow
