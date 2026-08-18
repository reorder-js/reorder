import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import {
  updateSubscriptionPaymentMethodStep,
  UpdateSubscriptionPaymentMethodStepInput,
} from "./steps/update-subscription-payment-method"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import type { SubscriptionPaymentMethodSummary } from "../modules/subscription/types"
import { toISOStringOrNull } from "./utils/date-output"

export type UpdateSubscriptionPaymentMethodWorkflowInput =
  UpdateSubscriptionPaymentMethodStepInput & {
    actor_type?: ActivityLogActorType
  }

export const updateSubscriptionPaymentMethodWorkflow = createWorkflow(
  "update-subscription-payment-method",
  function (input: UpdateSubscriptionPaymentMethodWorkflowInput) {
    const subscriptionChange = updateSubscriptionPaymentMethodStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_PAYMENT_METHOD_UPDATED,
            actor_type: input.actor_type ?? ActivityLogActorType.USER,
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
            previous_state: toPaymentMethodLogState(
              subscriptionChange.previous_payment_method
            ),
            new_state: toPaymentMethodLogState(
              subscriptionChange.current_payment_method
            ),
            metadata: {
              source: input.actor_type === ActivityLogActorType.CUSTOMER
                ? "storefront"
                : "admin",
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
      payment_method: subscriptionChange.current_payment_method,
    })
  }
)

export default updateSubscriptionPaymentMethodWorkflow

/**
 * Only non-sensitive card identifiers are logged. Raw provider payloads never
 * reach the activity log.
 */
export function toPaymentMethodLogState(
  paymentMethod: SubscriptionPaymentMethodSummary | null
): Record<string, string | number | null> | null {
  if (!paymentMethod) {
    return null
  }

  return {
    payment_provider_id: paymentMethod.provider_id,
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    exp_month: paymentMethod.exp_month,
    exp_year: paymentMethod.exp_year,
  }
}
