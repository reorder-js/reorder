import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  forceRenewalCycleStep,
  type ForceRenewalCycleStepInput,
} from "./steps/force-renewal-cycle"

export const forceRenewalCycleWorkflow = createWorkflow(
  "force-renewal-cycle",
  function (input: ForceRenewalCycleStepInput) {
    const renewal_cycle_id = forceRenewalCycleStep(input)

    return new WorkflowResponse(renewal_cycle_id)
  }
)

export default forceRenewalCycleWorkflow
