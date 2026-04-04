import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import type {
  SubscriptionFrequencyInterval,
  SubscriptionPaymentContext,
  SubscriptionPricingSnapshot,
  SubscriptionProductSnapshot,
  SubscriptionShippingAddress,
} from "../../modules/subscription/types"
import { SubscriptionStatus } from "../../modules/subscription/types"

export type CreateSubscriptionRecordStepInput = {
  customer_id: string
  cart_id: string
  order_id: string
  order_display_id: string | number | null
  started_at: string
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  customer_snapshot: {
    email: string
    full_name: string | null
  }
  product_snapshot: SubscriptionProductSnapshot
  pricing_snapshot: SubscriptionPricingSnapshot | null
  shipping_address: SubscriptionShippingAddress
  payment_context: SubscriptionPaymentContext
  is_trial: boolean
  trial_ends_at: string | null
  next_renewal_at: string | null
}

type CreatedSubscriptionRecord = {
  id: string
}

export const createSubscriptionRecordStep = createStep(
  "create-subscription-record",
  async function (
    input: CreateSubscriptionRecordStepInput,
    { container }
  ) {
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    const created = await subscriptionModule.createSubscriptions({
      reference: buildSubscriptionReference(input.order_display_id, input.order_id),
      status: SubscriptionStatus.ACTIVE,
      customer_id: input.customer_id,
      cart_id: input.cart_id,
      product_id: input.product_snapshot.product_id,
      variant_id: input.product_snapshot.variant_id,
      frequency_interval: input.frequency_interval,
      frequency_value: input.frequency_value,
      started_at: new Date(input.started_at),
      next_renewal_at: input.next_renewal_at
        ? new Date(input.next_renewal_at)
        : null,
      last_renewal_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_effective_at: null,
      skip_next_cycle: false,
      is_trial: input.is_trial,
      trial_ends_at: input.trial_ends_at ? new Date(input.trial_ends_at) : null,
      customer_snapshot: input.customer_snapshot,
      product_snapshot: input.product_snapshot,
      pricing_snapshot: input.pricing_snapshot,
      shipping_address: input.shipping_address,
      payment_context: input.payment_context,
      pending_update_data: null,
      metadata: {
        source: "store_cart_subscribe",
        source_order_id: input.order_id,
      },
    } as any)

    return new StepResponse<CreatedSubscriptionRecord, string>(
      {
        id: created.id,
      },
      created.id
    )
  },
  async function (subscriptionId, { container }) {
    if (!subscriptionId) {
      return
    }

    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    await subscriptionModule.deleteSubscriptions([subscriptionId])
  }
)

function buildSubscriptionReference(
  orderDisplayId: string | number | null,
  orderId: string
) {
  if (orderDisplayId !== null && orderDisplayId !== undefined) {
    return `SUB-${String(orderDisplayId)}`
  }

  return `SUB-${orderId}`
}
