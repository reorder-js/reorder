import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updateCancellationReasonStep,
  type UpdateCancellationReasonStepInput,
} from "./steps/update-cancellation-reason"

export const updateCancellationReasonWorkflow = createWorkflow(
  "update-cancellation-reason",
  function (input: UpdateCancellationReasonStepInput) {
    const result = updateCancellationReasonStep(input)

    return new WorkflowResponse(result)
  }
)

export default updateCancellationReasonWorkflow
