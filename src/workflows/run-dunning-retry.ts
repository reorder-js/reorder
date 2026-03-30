import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import {
  runDunningRetryStep,
  type RunDunningRetryStepInput,
} from "./steps/run-dunning-retry"

export const runDunningRetryWorkflow = createWorkflow(
  "run-dunning-retry",
  function (input: RunDunningRetryStepInput) {
    const lockKey = transform({ input }, function ({ input }) {
      return `dunning:${input.dunning_case_id}`
    })

    acquireLockStep({
      key: lockKey,
      timeout: 5,
      ttl: 120,
    })

    const result = runDunningRetryStep(input)

    releaseLockStep({
      key: lockKey,
    })

    return new WorkflowResponse(result)
  }
)

export default runDunningRetryWorkflow
