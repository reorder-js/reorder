import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  ensureNextRenewalCycleStep,
  type EnsureNextRenewalCycleStepInput,
} from "./steps/ensure-next-renewal-cycle"

export const ensureNextRenewalCycleWorkflow = createWorkflow(
  "ensure-next-renewal-cycle",
  function (input: EnsureNextRenewalCycleStepInput) {
    const result = ensureNextRenewalCycleStep(input)

    return new WorkflowResponse(result)
  }
)

export default ensureNextRenewalCycleWorkflow
