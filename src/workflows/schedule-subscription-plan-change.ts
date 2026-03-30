import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  scheduleSubscriptionPlanChangeStep,
  ScheduleSubscriptionPlanChangeStepInput,
} from "./steps/schedule-subscription-plan-change"

export const scheduleSubscriptionPlanChangeWorkflow = createWorkflow(
  "schedule-subscription-plan-change",
  function (input: ScheduleSubscriptionPlanChangeStepInput) {
    const subscription = scheduleSubscriptionPlanChangeStep(input)
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

export default scheduleSubscriptionPlanChangeWorkflow
