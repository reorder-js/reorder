import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updateSubscriptionSettingsStep,
  type UpdateSubscriptionSettingsStepInput,
} from "./steps/update-subscription-settings"

export const updateSubscriptionSettingsWorkflow = createWorkflow(
  "update-subscription-settings",
  function (input: UpdateSubscriptionSettingsStepInput) {
    const result = updateSubscriptionSettingsStep(input)

    return new WorkflowResponse(result)
  }
)

export default updateSubscriptionSettingsWorkflow
