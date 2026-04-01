import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  finalizeCancellationStep,
  type FinalizeCancellationStepInput,
} from "./steps/finalize-cancellation"

export const finalizeCancellationWorkflow = createWorkflow(
  "finalize-cancellation",
  function (input: FinalizeCancellationStepInput) {
    const result = finalizeCancellationStep(input)
    const ensureInput = transform({ result }, function ({ result }) {
      return {
        subscription_id: result.subscription_id,
      }
    })
    const renewal_cycle = ensureNextRenewalCycleStep(ensureInput)
    const output = transform(
      { result, renewal_cycle },
      function ({ result, renewal_cycle }) {
        return {
          cancellation_case_id: result.cancellation_case_id,
          subscription_id: result.subscription_id,
          case_status: result.case_status,
          final_outcome: result.final_outcome,
          cancel_effective_at: result.cancel_effective_at,
          renewal_cycle,
        }
      }
    )

    return new WorkflowResponse(output)
  }
)

export default finalizeCancellationWorkflow
