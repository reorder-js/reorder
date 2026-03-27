import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  resumeSubscriptionStep,
  ResumeSubscriptionStepInput,
} from "./steps/resume-subscription"

export const resumeSubscriptionWorkflow = createWorkflow(
  "resume-subscription",
  function (input: ResumeSubscriptionStepInput) {
    const subscription = resumeSubscriptionStep(input)

    return new WorkflowResponse({
      subscription,
    })
  }
)

export default resumeSubscriptionWorkflow
