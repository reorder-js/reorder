import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  startCancellationCaseStep,
  type StartCancellationCaseStepInput,
} from "./steps/start-cancellation-case"

export const startCancellationCaseWorkflow = createWorkflow(
  "start-cancellation-case",
  function (input: StartCancellationCaseStepInput) {
    const result = startCancellationCaseStep(input)

    return new WorkflowResponse(result)
  }
)

export default startCancellationCaseWorkflow
