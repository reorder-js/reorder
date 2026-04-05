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
import type { SubscriptionShippingAddress } from "../modules/subscription/types"
import { toISOStringOrNull } from "./utils/date-output"

export const updateSubscriptionShippingAddressWorkflow = createWorkflow(
  "update-subscription-shipping-address",
  function (input: UpdateSubscriptionShippingAddressStepInput) {
    const subscriptionChange = updateSubscriptionShippingAddressStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        const shippingAddressLogState = buildShippingAddressLogStates(
          subscriptionChange.previous.shipping_address ?? null,
          subscriptionChange.current.shipping_address ?? null
        )

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
            previous_state: shippingAddressLogState.previous,
            new_state: shippingAddressLogState.current,
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

type ShippingAddressChangeFlags = {
  address_lines_changed: boolean
  postal_code_changed: boolean
  phone_changed: boolean
}

export function buildShippingAddressLogStates(
  previous: SubscriptionShippingAddress | null,
  current: SubscriptionShippingAddress | null
): {
  previous: Record<string, string | boolean | null> | null
  current: Record<string, string | boolean | null> | null
} {
  if (!previous && !current) {
    return {
      previous: null,
      current: null,
    }
  }

  const previousAddress = previous ?? current!
  const currentAddress = current ?? previous!
  const changeFlags = getShippingAddressChangeFlags(previousAddress, currentAddress)

  return {
    previous: toShippingAddressLogState(previousAddress, changeFlags, false),
    current: toShippingAddressLogState(currentAddress, changeFlags, true),
  }
}

function toShippingAddressLogState(
  address: SubscriptionShippingAddress,
  changeFlags: ShippingAddressChangeFlags,
  changedState: boolean
): Record<string, string | boolean | null> {
  const recipient = [address.first_name, address.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()

  return {
    recipient: recipient || null,
    address: formatAddressLines(address),
    city: address.city || null,
    province: address.province ?? null,
    postal_code_changed:
      changeFlags.postal_code_changed ? changedState : false,
    country_code: address.country_code || null,
    phone_changed: changeFlags.phone_changed ? changedState : false,
  }
}

function getShippingAddressChangeFlags(
  previous: SubscriptionShippingAddress,
  current: SubscriptionShippingAddress
): ShippingAddressChangeFlags {
  return {
    address_lines_changed: haveAddressLinesChanged(previous, current),
    postal_code_changed: previous.postal_code !== current.postal_code,
    phone_changed: normalizePhone(previous.phone) !== normalizePhone(current.phone),
  }
}

function haveAddressLinesChanged(
  left: SubscriptionShippingAddress,
  right: SubscriptionShippingAddress
) {
  return (
    normalizeAddressLine(left.address_1) !== normalizeAddressLine(right.address_1) ||
    normalizeAddressLine(left.address_2) !== normalizeAddressLine(right.address_2)
  )
}

function normalizeAddressLine(value: string | null) {
  return (value ?? "").trim()
}

function formatAddressLines(address: SubscriptionShippingAddress) {
  return [normalizeAddressLine(address.address_1), normalizeAddressLine(address.address_2)]
    .filter(Boolean)
    .join(", ") || null
}

function normalizePhone(value: string | null) {
  return value ? value.replace(/\s+/g, "") : ""
}
