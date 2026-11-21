import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
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

    // A recovered retry closes the renewal cycle and advances the subscription,
    // so the next upcoming cycle has to be scheduled like after a successful renewal.
    when(
      "ensure-next-cycle-after-dunning-recovery",
      { result },
      ({ result }) => result.outcome === "recovered"
    ).then(() => {
      const ensureInput = transform({ result }, ({ result }) => ({
        subscription_id: result.subscription_id,
      }))

      ensureNextRenewalCycleStep(ensureInput)
    })

    releaseLockStep({
      key: lockKey,
    })

    return new WorkflowResponse(result)
  }
)

export default runDunningRetryWorkflow
