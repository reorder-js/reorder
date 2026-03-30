import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  markDunningRecoveredStep,
  type MarkDunningRecoveredStepInput,
} from "./steps/mark-dunning-recovered"

export const markDunningRecoveredWorkflow = createWorkflow(
  "mark-dunning-recovered",
  function (input: MarkDunningRecoveredStepInput) {
    const result = markDunningRecoveredStep(input)

    return new WorkflowResponse(result)
  }
)

export default markDunningRecoveredWorkflow
