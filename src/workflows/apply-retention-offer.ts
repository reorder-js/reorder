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
  applyRetentionOfferStep,
  type ApplyRetentionOfferStepInput,
} from "./steps/apply-retention-offer"

export const applyRetentionOfferWorkflow = createWorkflow(
  "apply-retention-offer",
  function (input: ApplyRetentionOfferStepInput) {
    const result = applyRetentionOfferStep(input)
    const logInput = transform({ result, input }, function ({ result, input }) {
      return {
        log_event: normalizeActivityLogEvent({
          subscription_id: result.current.subscription_id,
          customer_id: result.subscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_OFFER_APPLIED,
          actor_type: ActivityLogActorType.USER,
          actor_id: input.decided_by ?? null,
          display: {
            subscription_reference: result.subscription.reference,
            customer_name: result.subscription.customer_snapshot?.full_name ?? null,
            product_title: result.subscription.product_snapshot?.product_title ?? null,
            variant_title: result.subscription.product_snapshot?.variant_title ?? null,
          },
          previous_state: {
            status: result.previous.status,
            final_outcome: result.previous.final_outcome,
          },
          new_state: {
            status: result.current.status,
            final_outcome: result.current.final_outcome,
            recommended_action: result.current.recommended_action,
          },
          reason: input.decision_reason ?? null,
          metadata: {
            source: "admin",
            cancellation_case_id: result.current.id,
            retention_offer_event_id: result.retention_offer_event_id,
            trigger_type: input.offer_type,
          },
          dedupe: {
            scope: "cancellation",
            target_id: result.current.id,
            qualifier: result.retention_offer_event_id,
          },
        }),
      }
    })
    createSubscriptionLogEventStep(logInput)

    return new WorkflowResponse(result)
  }
)

export default applyRetentionOfferWorkflow
