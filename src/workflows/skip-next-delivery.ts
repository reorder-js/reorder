import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { skipNextDeliveryStep, type SkipNextDeliveryStepInput } from "./steps/skip-next-delivery"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { getEffectiveNextRenewalAt } from "../modules/subscription/utils/effective-next-renewal"
import { toISOStringOrNull } from "./utils/date-output"

export const skipNextDeliveryWorkflow = createWorkflow(
  "skip-next-delivery",
  function (input: SkipNextDeliveryStepInput) {
    const subscriptionChange = skipNextDeliveryStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_NEXT_DELIVERY_SKIPPED,
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
              skip_next_cycle: false,
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.previous.next_renewal_at
              ),
              effective_next_renewal_at: toISOStringOrNull(
                getEffectiveNextRenewalAt({
                  next_renewal_at: subscriptionChange.previous.next_renewal_at,
                  skip_next_cycle: false,
                  frequency_interval: subscriptionChange.previous.frequency_interval,
                  frequency_value: subscriptionChange.previous.frequency_value,
                })
              ),
            },
            new_state: {
              skip_next_cycle: true,
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.current.next_renewal_at
              ),
              effective_next_renewal_at: toISOStringOrNull(
                getEffectiveNextRenewalAt({
                  next_renewal_at: subscriptionChange.current.next_renewal_at,
                  skip_next_cycle: true,
                  frequency_interval: subscriptionChange.current.frequency_interval,
                  frequency_value: subscriptionChange.current.frequency_value,
                })
              ),
            },
            metadata: {
              source: "storefront",
              effective_at: toISOStringOrNull(
                getEffectiveNextRenewalAt({
                  next_renewal_at: subscriptionChange.current.next_renewal_at,
                  skip_next_cycle: true,
                  frequency_interval: subscriptionChange.current.frequency_interval,
                  frequency_value: subscriptionChange.current.frequency_value,
                })
              ),
            },
            dedupe: {
              scope: "subscription",
              target_id: subscriptionChange.current.id,
              qualifier: toISOStringOrNull(subscriptionChange.current.updated_at),
            },
          }),
        }
      }
    )
    createSubscriptionLogEventStep(logInput)

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
    })
  }
)

export default skipNextDeliveryWorkflow
