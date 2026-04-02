import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  SubscriptionShippingAddress,
  SubscriptionStatus,
} from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import {
  asSubscriptionUpdateInput,
  asSubscriptionWorkflowRecord,
  SubscriptionWorkflowRecord,
  SubscriptionWorkflowStepResult,
} from "./pause-subscription"

export type UpdateSubscriptionShippingAddressStepInput =
  SubscriptionShippingAddress & {
    id: string
    triggered_by?: string | null
  }

export const updateSubscriptionShippingAddressStep = createStep(
  "update-subscription-shipping-address",
  async function (
    input: UpdateSubscriptionShippingAddressStepInput,
    { container }
  ) {
    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionModuleService.retrieveSubscription(
      input.id
    )

    if (
      subscription.status !== SubscriptionStatus.ACTIVE &&
      subscription.status !== SubscriptionStatus.PAUSED &&
      subscription.status !== SubscriptionStatus.PAST_DUE
    ) {
      throw subscriptionErrors.invalidState(
        input.id,
        "update shipping address",
        subscription.status
      )
    }

    if (!input.country_code.trim()) {
      throw subscriptionErrors.invalidData("country_code is required")
    }

    const updatedAt = new Date().toISOString()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      shipping_address: {
        first_name: input.first_name,
        last_name: input.last_name,
        company: input.company,
        address_1: input.address_1,
        address_2: input.address_2,
        city: input.city,
        postal_code: input.postal_code,
        province: input.province,
        country_code: input.country_code,
        phone: input.phone,
      },
      metadata: {
        ...(subscription.metadata ?? {}),
        shipping_address_update_context: {
          triggered_by: input.triggered_by ?? null,
          updated_at: updatedAt,
        },
      },
    })

    return new StepResponse<SubscriptionWorkflowStepResult, SubscriptionWorkflowRecord>(
      {
        current: asSubscriptionWorkflowRecord(updated),
        previous: asSubscriptionWorkflowRecord(subscription),
      },
      asSubscriptionWorkflowRecord(subscription)
    )
  },
  async function (subscription: SubscriptionWorkflowRecord, { container }) {
    if (!subscription) {
      return
    }

    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    await subscriptionModuleService.updateSubscriptions(
      asSubscriptionUpdateInput(subscription)
    )
  }
)
