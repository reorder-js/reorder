import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import {
  updateSubscriptionShippingAddressStep,
  UpdateSubscriptionShippingAddressStepInput,
} from "./steps/update-subscription-shipping-address"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { toISOStringOrNull } from "./utils/date-output"

export const updateSubscriptionShippingAddressWorkflow = createWorkflow(
  "update-subscription-shipping-address",
  function (input: UpdateSubscriptionShippingAddressStepInput) {
    const subscriptionChange = updateSubscriptionShippingAddressStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_SHIPPING_ADDRESS_UPDATED,
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
              city: subscriptionChange.previous.shipping_address?.city ?? null,
              province: subscriptionChange.previous.shipping_address?.province ?? null,
              country_code:
                subscriptionChange.previous.shipping_address?.country_code ?? null,
            },
            new_state: {
              city: subscriptionChange.current.shipping_address?.city ?? null,
              province: subscriptionChange.current.shipping_address?.province ?? null,
              country_code:
                subscriptionChange.current.shipping_address?.country_code ?? null,
            },
            metadata: {
              source: "admin",
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

export default updateSubscriptionShippingAddressWorkflow
