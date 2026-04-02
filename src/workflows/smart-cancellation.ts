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
  smartCancellationStep,
  type SmartCancellationStepInput,
} from "./steps/smart-cancellation"
import { toISOStringOrNull } from "./utils/date-output"

export const smartCancellationWorkflow = createWorkflow(
  "smart-cancellation",
  function (input: SmartCancellationStepInput) {
    const result = smartCancellationStep(input)
    const logInput = transform({ result, input }, function ({ result, input }) {
      return {
        log_event: normalizeActivityLogEvent({
          subscription_id: result.current.subscription_id,
          customer_id: result.subscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_RECOMMENDATION_GENERATED,
          actor_type: ActivityLogActorType.USER,
          actor_id: input.evaluated_by ?? null,
          display: {
            subscription_reference: result.subscription.reference,
            customer_name: result.subscription.customer_snapshot?.full_name ?? null,
            product_title: result.subscription.product_snapshot?.product_title ?? null,
            variant_title: result.subscription.product_snapshot?.variant_title ?? null,
          },
          previous_state: {
            status: result.previous.status,
            recommended_action: result.previous.recommended_action,
          },
          new_state: {
            status: result.current.status,
            recommended_action: result.current.recommended_action,
            eligible_actions: result.eligible_actions,
          },
          reason: result.rationale,
          metadata: {
            source: "admin",
            cancellation_case_id: result.current.id,
            reason_code: result.has_active_dunning ? "has_active_dunning" : null,
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

export default smartCancellationWorkflow
