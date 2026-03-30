import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  startDunningStep,
  type StartDunningStepInput,
} from "./steps/start-dunning"

export const startDunningWorkflow = createWorkflow(
  "start-dunning",
  function (input: StartDunningStepInput) {
    const result = startDunningStep(input)

    return new WorkflowResponse(result)
  }
)

export default startDunningWorkflow
