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
import {
  updateCancellationReasonStep,
  type UpdateCancellationReasonStepInput,
} from "./steps/update-cancellation-reason"
import { toISOStringOrNull } from "./utils/date-output"

export const updateCancellationReasonWorkflow = createWorkflow(
  "update-cancellation-reason",
  function (input: UpdateCancellationReasonStepInput) {
    const result = updateCancellationReasonStep(input)
    const logInput = transform({ result, input }, function ({ result, input }) {
      return {
        log_event: normalizeActivityLogEvent({
          subscription_id: result.current.subscription_id,
          customer_id: result.subscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_REASON_UPDATED,
          actor_type: ActivityLogActorType.USER,
          actor_id: input.updated_by ?? null,
          display: {
            subscription_reference: result.subscription.reference,
            customer_name: result.subscription.customer_snapshot?.full_name ?? null,
            product_title: result.subscription.product_snapshot?.product_title ?? null,
            variant_title: result.subscription.product_snapshot?.variant_title ?? null,
          },
          previous_state: {
            reason: result.previous.reason,
            reason_category: result.previous.reason_category,
            notes: result.previous.notes,
          },
          new_state: {
            reason: result.current.reason,
            reason_category: result.current.reason_category,
            notes: result.current.notes,
          },
          reason: input.update_reason ?? result.current.reason ?? null,
          metadata: {
            source: "admin",
            cancellation_case_id: result.current.id,
          },
          dedupe: {
            scope: "cancellation",
            target_id: result.current.id,
            qualifier: toISOStringOrNull(result.current.updated_at),
          },
        }),
      }
    })
    createSubscriptionLogEventStep(logInput)

    return new WorkflowResponse(result)
  }
)

export default updateCancellationReasonWorkflow
