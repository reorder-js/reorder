import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { skipNextDeliveryStep, type SkipNextDeliveryStepInput } from "./steps/skip-next-delivery"

export const skipNextDeliveryWorkflow = createWorkflow(
  "skip-next-delivery",
  function (input: SkipNextDeliveryStepInput) {
    const subscriptionChange = skipNextDeliveryStep(input)

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
    })
  }
)

export default skipNextDeliveryWorkflow
