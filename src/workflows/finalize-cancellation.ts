import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  finalizeCancellationStep,
  type FinalizeCancellationStepInput,
} from "./steps/finalize-cancellation"
import { toISOStringOrNull } from "./utils/date-output"

export const finalizeCancellationWorkflow = createWorkflow(
  "finalize-cancellation",
  function (input: FinalizeCancellationStepInput) {
    const result = finalizeCancellationStep(input)
    const logInput = transform({ result, input }, function ({ result, input }) {
      return {
        log_event: normalizeActivityLogEvent({
          subscription_id: result.current.subscription_id,
          customer_id: result.subscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_FINALIZED,
          actor_type: ActivityLogActorType.USER,
          actor_id: input.finalized_by ?? null,
          display: {
            subscription_reference: result.subscription.reference,
            customer_name: result.subscription.customer_snapshot?.full_name ?? null,
            product_title: result.subscription.product_snapshot?.product_title ?? null,
            variant_title: result.subscription.product_snapshot?.variant_title ?? null,
          },
          previous_state: {
            status: result.previous.status,
            final_outcome: result.previous.final_outcome,
            cancellation_effective_at: toISOStringOrNull(
              result.previous.cancellation_effective_at
            ),
            reason: result.previous.reason,
            reason_category: result.previous.reason_category,
          },
          new_state: {
            status: result.current.status,
            final_outcome: result.current.final_outcome,
            cancellation_effective_at: toISOStringOrNull(
              result.current.cancellation_effective_at
            ),
            reason: result.current.reason,
            reason_category: result.current.reason_category,
          },
          reason: result.current.reason ?? null,
          metadata: {
            source: "admin",
            cancellation_case_id: result.current.id,
            effective_at: input.effective_at ?? "immediately",
          },
          dedupe: {
            scope: "cancellation",
            target_id: result.current.id,
            qualifier: toISOStringOrNull(result.current.finalized_at),
          },
        }),
      }
    })
    createSubscriptionLogEventStep(logInput)
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
