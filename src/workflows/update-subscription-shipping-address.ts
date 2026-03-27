import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updateSubscriptionShippingAddressStep,
  UpdateSubscriptionShippingAddressStepInput,
} from "./steps/update-subscription-shipping-address"

export const updateSubscriptionShippingAddressWorkflow = createWorkflow(
  "update-subscription-shipping-address",
  function (input: UpdateSubscriptionShippingAddressStepInput) {
    const subscription = updateSubscriptionShippingAddressStep(input)

    return new WorkflowResponse({
      subscription,
    })
  }
)

export default updateSubscriptionShippingAddressWorkflow
