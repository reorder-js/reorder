import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  pauseSubscriptionStep,
  PauseSubscriptionStepInput,
} from "./steps/pause-subscription"

export const pauseSubscriptionWorkflow = createWorkflow(
  "pause-subscription",
  function (input: PauseSubscriptionStepInput) {
    const subscription = pauseSubscriptionStep(input)
    const ensureInput = transform({ subscription }, function ({ subscription }) {
      return {
        subscription_id: subscription.id,
      }
    })
    const renewal_cycle = ensureNextRenewalCycleStep(ensureInput)

    return new WorkflowResponse({
      subscription,
      renewal_cycle,
    })
  }
)

export default pauseSubscriptionWorkflow
