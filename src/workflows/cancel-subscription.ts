import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  cancelSubscriptionStep,
  CancelSubscriptionStepInput,
} from "./steps/cancel-subscription"

export const cancelSubscriptionWorkflow = createWorkflow(
  "cancel-subscription",
  function (input: CancelSubscriptionStepInput) {
    const subscription = cancelSubscriptionStep(input)
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

export default cancelSubscriptionWorkflow
