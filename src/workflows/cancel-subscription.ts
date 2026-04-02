import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  cancelSubscriptionStep,
  CancelSubscriptionStepInput,
} from "./steps/cancel-subscription"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { toISOStringOrNull } from "./utils/date-output"

export const cancelSubscriptionWorkflow = createWorkflow(
  "cancel-subscription",
  function (input: CancelSubscriptionStepInput) {
    const subscriptionChange = cancelSubscriptionStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_CANCELED,
            actor_type: ActivityLogActorType.USER,
            actor_id: input.triggered_by ?? null,
            display: {
              subscription_reference: subscriptionChange.current.reference,
              customer_name:
                subscriptionChange.current.customer_snapshot?.full_name ?? null,
              product_title:
                subscriptionChange.current.product_snapshot?.product_title ?? null,
              variant_title:
                subscriptionChange.current.product_snapshot?.variant_title ?? null,
            },
            previous_state: {
              status: subscriptionChange.previous.status,
              cancel_effective_at: toISOStringOrNull(
                subscriptionChange.previous.cancel_effective_at
              ),
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.previous.next_renewal_at
              ),
            },
            new_state: {
              status: subscriptionChange.current.status,
              cancelled_at: toISOStringOrNull(
                subscriptionChange.current.cancelled_at
              ),
              cancel_effective_at: toISOStringOrNull(
                subscriptionChange.current.cancel_effective_at
              ),
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.current.next_renewal_at
              ),
            },
            reason: input.reason ?? null,
            metadata: {
              source: "admin",
              effective_at: toISOStringOrNull(
                subscriptionChange.current.cancel_effective_at
              ),
            },
            dedupe: {
              scope: "subscription",
              target_id: subscriptionChange.current.id,
              qualifier: toISOStringOrNull(subscriptionChange.current.cancelled_at),
            },
          }),
        }
      }
    )
    createSubscriptionLogEventStep(logInput)
    const ensureInput = transform({ subscriptionChange }, function ({ subscriptionChange }) {
      return {
        subscription_id: subscriptionChange.current.id,
      }
    })
    const renewal_cycle = ensureNextRenewalCycleStep(ensureInput)

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
      renewal_cycle,
    })
  }
)

export default cancelSubscriptionWorkflow
