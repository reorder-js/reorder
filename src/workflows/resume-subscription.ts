import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  resumeSubscriptionStep,
  ResumeSubscriptionStepInput,
} from "./steps/resume-subscription"

export const resumeSubscriptionWorkflow = createWorkflow(
  "resume-subscription",
  function (input: ResumeSubscriptionStepInput) {
    const subscription = resumeSubscriptionStep(input)
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

export default resumeSubscriptionWorkflow
