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

export type CreateSubscriptionFromCartWorkflowInput =
  ValidateSubscriptionCartStepInput

type OrderRecord = {
  id: string
  display_id?: string | number | null
  created_at: string | Date
}

const SUBSCRIPTION_ORDER_LINK_ENTRY_POINT = "subscription_order"

export const createSubscriptionFromCartWorkflow = createWorkflow(
  "create-subscription-from-cart",
  function (input: CreateSubscriptionFromCartWorkflowInput) {
    const lockInput = transform({ input }, ({ input }) => ({
      key: input.cart_id,
      timeout: 30,
      ttl: 120,
    }))

    acquireLockStep(lockInput)

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

    const existingLinks = useQueryGraphStep({
      entity: SUBSCRIPTION_ORDER_LINK_ENTRY_POINT,
      fields: ["subscription.id"],
      filters: {
        order_id: orderId,
      },
    }).config({
      name: "retrieve-existing-subscription-order-links",
    })

    const existingSubscriptionId = transform(
      { existingLinks },
      ({ existingLinks }) => {
        const first = existingLinks.data?.[0] as
          | {
              subscription?: {
                id?: string | null
              } | null
            }
          | undefined

        return first?.subscription?.id ?? null
      }
    )

    const orderQuery = useQueryGraphStep({
      entity: "order",
      fields: ["id", "display_id", "created_at"],
      filters: {
        id: [orderId],
      },
      options: {
        isList: false,
      },
    }).config({
      name: "load-completed-subscription-order",
    })

    const createSubscriptionInput = transform(
      { validatedCart, orderQuery, orderId },
      ({ validatedCart, orderQuery, orderId }) => {
        const order = orderQuery.data as OrderRecord | undefined

        if (!order) {
          throw new Error(`Completed order '${orderId}' was not found`)
        }

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
          shipping_address: validatedCart.shipping_address,
          payment_context: validatedCart.payment_context,
          is_trial: validatedCart.trial_days > 0,
          trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
          next_renewal_at: nextRenewalAt.toISOString(),
        } satisfies CreateSubscriptionRecordStepInput
      }
    )

    const createdSubscription = when(
      { existingSubscriptionId },
      ({ existingSubscriptionId }) => !existingSubscriptionId
    ).then(() => {
      return createSubscriptionRecordStep(createSubscriptionInput)
    })

    const createdSubscriptionId = transform(
      { createdSubscription },
      ({ createdSubscription }) => createdSubscription?.id ?? null
    )

    when(
      { createdSubscriptionId, validatedCart, orderId },
      ({ createdSubscriptionId }) => !!createdSubscriptionId
    ).then(() => {
      return linkSubscriptionCommerceEntitiesStep({
        subscription_id: createdSubscriptionId,
        customer_id: validatedCart.customer_id,
        cart_id: validatedCart.cart_id,
        order_id: orderId,
      }).config({
        name: "create-subscription-commerce-links",
      })
    })

    const subscriptionId = transform(
      { existingSubscriptionId, createdSubscriptionId },
      ({ existingSubscriptionId, createdSubscriptionId }) => {
        const id = existingSubscriptionId ?? createdSubscriptionId

        if (!id) {
          throw new Error("Subscription create flow did not resolve a subscription")
        }

        return id
      }
    )

    createInitialRenewalCycleStep(
      transform({ subscriptionId }, ({ subscriptionId }) => ({
        subscription_id: subscriptionId,
      }))
    )

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
      name: "load-created-subscription",
    })

    releaseLockStep(
      transform({ subscriptionQuery, input }, ({ input }) => ({
        key: input.cart_id,
      }))
    )

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

function advanceCadence(
  date: Date,
  interval: CreateSubscriptionRecordStepInput["frequency_interval"],
  value: number
) {
  const next = new Date(date)

  switch (interval) {
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
