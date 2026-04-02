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
  startCancellationCaseStep,
  type StartCancellationCaseStepInput,
} from "./steps/start-cancellation-case"
import { toISOStringOrNull } from "./utils/date-output"

export const startCancellationCaseWorkflow = createWorkflow(
  "start-cancellation-case",
  function (input: StartCancellationCaseStepInput) {
    const result = startCancellationCaseStep(input)
    const logInput = transform({ result, input }, function ({ result, input }) {
      return {
        log_event: normalizeActivityLogEvent({
          subscription_id: result.current.subscription_id,
          customer_id: result.subscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_CASE_STARTED,
          actor_type: ActivityLogActorType.USER,
          actor_id: input.entry_context?.triggered_by ?? null,
          display: {
            subscription_reference: result.subscription.reference,
            customer_name: result.subscription.customer_snapshot?.full_name ?? null,
            product_title: result.subscription.product_snapshot?.product_title ?? null,
            variant_title: result.subscription.product_snapshot?.variant_title ?? null,
          },
          previous_state: result.previous
            ? {
                status: result.previous.status,
                reason: result.previous.reason,
                reason_category: result.previous.reason_category,
                notes: result.previous.notes,
              }
            : null,
          new_state: {
            status: result.current.status,
            reason: result.current.reason,
            reason_category: result.current.reason_category,
            notes: result.current.notes,
          },
          reason: result.current.reason ?? null,
          metadata: {
            source: "admin",
            cancellation_case_id: result.current.id,
            trigger_type: input.entry_context?.source ?? "admin_manual",
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

export default startCancellationCaseWorkflow
