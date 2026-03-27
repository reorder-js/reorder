import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  cancelSubscriptionStep,
  CancelSubscriptionStepInput,
} from "./steps/cancel-subscription"

export const cancelSubscriptionWorkflow = createWorkflow(
  "cancel-subscription",
  function (input: CancelSubscriptionStepInput) {
    const subscription = cancelSubscriptionStep(input)

    return new WorkflowResponse({
      subscription,
    })
  }
)

export default cancelSubscriptionWorkflow
