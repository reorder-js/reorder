import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  rejectRenewalChangesStep,
  type RejectRenewalChangesStepInput,
} from "./steps/reject-renewal-changes"

export const rejectRenewalChangesWorkflow = createWorkflow(
  "reject-renewal-changes",
  function (input: RejectRenewalChangesStepInput) {
    const renewal_cycle = rejectRenewalChangesStep(input)

    return new WorkflowResponse({
      renewal_cycle,
    })
  }
)

export default rejectRenewalChangesWorkflow

