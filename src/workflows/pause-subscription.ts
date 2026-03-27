import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  pauseSubscriptionStep,
  PauseSubscriptionStepInput,
} from "./steps/pause-subscription"

export const pauseSubscriptionWorkflow = createWorkflow(
  "pause-subscription",
  function (input: PauseSubscriptionStepInput) {
    const subscription = pauseSubscriptionStep(input)

    return new WorkflowResponse({
      subscription,
    })
  }
)

export default pauseSubscriptionWorkflow
