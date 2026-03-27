import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  scheduleSubscriptionPlanChangeStep,
  ScheduleSubscriptionPlanChangeStepInput,
} from "./steps/schedule-subscription-plan-change"

export const scheduleSubscriptionPlanChangeWorkflow = createWorkflow(
  "schedule-subscription-plan-change",
  function (input: ScheduleSubscriptionPlanChangeStepInput) {
    const subscription = scheduleSubscriptionPlanChangeStep(input)

    return new WorkflowResponse({
      subscription,
    })
  }
)

export default scheduleSubscriptionPlanChangeWorkflow
