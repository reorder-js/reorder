import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  runDunningRetryStep,
  type RunDunningRetryStepInput,
} from "./steps/run-dunning-retry"

export const runDunningRetryWorkflow = createWorkflow(
  "run-dunning-retry",
  function (input: RunDunningRetryStepInput) {
    const result = runDunningRetryStep(input)

    return new WorkflowResponse(result)
  }
)

export default runDunningRetryWorkflow
