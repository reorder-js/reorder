import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  approveRenewalChangesStep,
  type ApproveRenewalChangesStepInput,
} from "./steps/approve-renewal-changes"

export const approveRenewalChangesWorkflow = createWorkflow(
  "approve-renewal-changes",
  function (input: ApproveRenewalChangesStepInput) {
    const renewal_cycle = approveRenewalChangesStep(input)

    return new WorkflowResponse({
      renewal_cycle,
    })
  }
)

export default approveRenewalChangesWorkflow

