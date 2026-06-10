import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  completeCartWorkflow,
  refreshCartItemsWorkflow,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { syncSubscriptionCartPricingStep } from "../workflows/steps/sync-subscription-cart-pricing"
import { createInitialRenewalCycleStep } from "../workflows/steps/create-initial-renewal-cycle"
import { labelSubscriptionOrderAdjustmentsStep } from "../workflows/steps/label-subscription-order-adjustments"
import {
  createSubscriptionRecordStep,
  type CreateSubscriptionRecordStepInput,
} from "../workflows/steps/create-subscription-record"
import { linkSubscriptionCommerceEntitiesStep } from "../workflows/steps/link-subscription-commerce-entities"
import {
  validateSubscriptionCartStep,
  type ValidateSubscriptionCartStepInput,
} from "../workflows/steps/validate-subscription-cart"
import { addCompleteAllowedMetadataEntryStep } from "./steps/add-complete-allowed-metadata-entry"

export type CreateSubscriptionFromCartWorkflowInput =
  ValidateSubscriptionCartStepInput

export const createSubscriptionFromCartWorkflow = createWorkflow(
  "create-subscription-from-cart",
  function (input: CreateSubscriptionFromCartWorkflowInput) {
    acquireLockStep({
      key: input.cart_id,
      timeout: 30,
      ttl: 120,
    })

    const pricingSync = syncSubscriptionCartPricingStep({
      cart_id: input.cart_id,
    })

    const refreshedCart = refreshCartItemsWorkflow.runAsStep({
      input: transform({ pricingSync, input }, ({ input }) => ({
        cart_id: input.cart_id,
        force_refresh: true,
      })),
    })

    const validatedCart = validateSubscriptionCartStep(input)
    addCompleteAllowedMetadataEntryStep({ cartId: input.cart_id })

    const completedCart = completeCartWorkflow.runAsStep({
      input: transform({ refreshedCart, input }, ({ input }) => ({
        id: input.cart_id,
      })),

    })
    const orderId = transform({ completedCart }, ({ completedCart }) => {
      return completedCart.id
    })

    labelSubscriptionOrderAdjustmentsStep({
      order_id: orderId,
    })

    const orderQuery = useQueryGraphStep({
      entity: "order",
      fields: ["id", "display_id", "created_at", "subscription.id"],
      filters: {
        id: [orderId],
      },
      options: {
        isList: false,
      },
    }).config({
      name: "load-completed-subscription-order",
    })

    const existingSubscriptionId = transform({ orderQuery }, ({ orderQuery }) => orderQuery.data.subscription?.id)

    // If order isn't linked to subscription then we are running this workflow for the 1st time and we should create the subscription for it
    const createdSubscription = when("create-subscription", { existingSubscriptionId }, ({ existingSubscriptionId }) => !existingSubscriptionId).then(() => {
      const createSubscriptionInput = transform(
        { validatedCart, orderQuery, orderId },
        ({ validatedCart, orderQuery, orderId }) => {
          const order = orderQuery.data

          if (!order) {
            throw new Error(`Completed order '${orderId}' was not found`)
          }

          return buildSubscriptionInput(validatedCart, order)
        }
      )

      const createdSubscription = createSubscriptionRecordStep(createSubscriptionInput)

      linkSubscriptionCommerceEntitiesStep({
        subscription_id: createdSubscription.id,
        customer_id: validatedCart.customer_id,
        cart_id: validatedCart.cart_id,
        order_id: orderId,
      }).config({
        name: "create-subscription-commerce-links",
      })

      createInitialRenewalCycleStep({
        subscription_id: createdSubscription.id,
      })

      return createdSubscription
    })

    const subscriptionId = transform({ existingSubscriptionId, createdSubscription }, ({ existingSubscriptionId, createdSubscription }) => {
      if (existingSubscriptionId === undefined && createdSubscription?.id === undefined) {
        throw new Error("Subscription create flow did not resolve existing subscription neither created new")
      }
      return existingSubscriptionId ?? createdSubscription!.id
    })

    const subscriptionQuery = useQueryGraphStep({
      entity: "subscription",
      fields: [
        "id",
        "reference",
        "status",
        "customer_id",
        "cart_id",
        "product_id",
        "variant_id",
        "frequency_interval",
        "frequency_value",
        "started_at",
        "next_renewal_at",
        "last_renewal_at",
        "paused_at",
        "cancelled_at",
        "cancel_effective_at",
        "skip_next_cycle",
        "is_trial",
        "trial_ends_at",
        "customer_snapshot",
        "product_snapshot",
        "pricing_snapshot",
        "shipping_address",
        "source_snapshot",
        "payment_context",
        "pending_update_data",
        "metadata",
      ],
      filters: {
        id: [subscriptionId],
      },
      options: {
        isList: false,
      },
    }).config({
      name: "load-created-or-existing-subscription",
    })

    releaseLockStep({ key: input.cart_id })

    return new WorkflowResponse({
      type: "order" as const,
      order: orderQuery.data,
      subscription: subscriptionQuery.data,
    })
  }
)

export default createSubscriptionFromCartWorkflow

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function buildSubscriptionInput(
  validatedCart: {
    customer_id: string
    cart_id: string
    frequency_interval: CreateSubscriptionRecordStepInput["frequency_interval"]
    frequency_value: number
    customer_snapshot: CreateSubscriptionRecordStepInput["customer_snapshot"]
    product_snapshot: CreateSubscriptionRecordStepInput["product_snapshot"]
    pricing_snapshot: CreateSubscriptionRecordStepInput["pricing_snapshot"]
    source_snapshot: CreateSubscriptionRecordStepInput["source_snapshot"]
    shipping_address?: CreateSubscriptionRecordStepInput["shipping_address"]
    payment_context: CreateSubscriptionRecordStepInput["payment_context"]
    trial_days: number
  },
  order: { id: string, display_id?: string | number | null, created_at: string | Date }
): CreateSubscriptionRecordStepInput {
  const startedAt = toDate(order.created_at)
  const trialEndsAt =
    validatedCart.trial_days > 0
      ? addDays(startedAt, validatedCart.trial_days)
      : null
  const nextRenewalAt =
    validatedCart.trial_days > 0
      ? trialEndsAt
      : advanceCadence(
          startedAt,
          validatedCart.frequency_interval,
          validatedCart.frequency_value
        )

  if (!nextRenewalAt) {
    throw new Error("Subscription create flow failed to calculate next renewal date")
  }

  return {
    customer_id: validatedCart.customer_id,
    cart_id: validatedCart.cart_id,
    order_id: order.id,
    order_display_id: order.display_id ?? null,
    started_at: startedAt.toISOString(),
    frequency_interval: validatedCart.frequency_interval,
    frequency_value: validatedCart.frequency_value,
    customer_snapshot: validatedCart.customer_snapshot,
    product_snapshot: validatedCart.product_snapshot,
    pricing_snapshot: validatedCart.pricing_snapshot,
    source_snapshot: validatedCart.source_snapshot,
    shipping_address: validatedCart.shipping_address,
    payment_context: validatedCart.payment_context,
    is_trial: validatedCart.trial_days > 0,
    trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
    next_renewal_at: nextRenewalAt.toISOString(),
  }
}

export function advanceCadence(
  date: Date,
  interval: CreateSubscriptionRecordStepInput["frequency_interval"],
  value: number
) {
  const next = new Date(date)

  switch (interval) {
    case "day":
      next.setUTCDate(next.getUTCDate() + value)
      return next
    case "week":
      next.setUTCDate(next.getUTCDate() + value * 7)
      return next
    case "month":
      next.setUTCMonth(next.getUTCMonth() + value)
      return next
    case "year":
      next.setUTCFullYear(next.getUTCFullYear() + value)
      return next
  }
}
