import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  markDunningUnrecoveredStep,
  type MarkDunningUnrecoveredStepInput,
} from "./steps/mark-dunning-unrecovered"

export const markDunningUnrecoveredWorkflow = createWorkflow(
  "mark-dunning-unrecovered",
  function (input: MarkDunningUnrecoveredStepInput) {
    const result = markDunningUnrecoveredStep(input)

    return new WorkflowResponse(result)
  }
)

export default markDunningUnrecoveredWorkflow
