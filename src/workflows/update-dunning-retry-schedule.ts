import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updateDunningRetryScheduleStep,
  type UpdateDunningRetryScheduleStepInput,
} from "./steps/update-dunning-retry-schedule"

export const updateDunningRetryScheduleWorkflow = createWorkflow(
  "update-dunning-retry-schedule",
  function (input: UpdateDunningRetryScheduleStepInput) {
    const result = updateDunningRetryScheduleStep(input)

    return new WorkflowResponse(result)
  }
)

export default updateDunningRetryScheduleWorkflow
