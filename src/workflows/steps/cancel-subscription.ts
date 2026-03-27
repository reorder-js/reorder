import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

export type CancelSubscriptionStepInput = {
  id: string
  reason?: string
  effective_at?: "immediately" | "end_of_cycle"
}

export const cancelSubscriptionStep = createStep(
  "cancel-subscription",
  async function (input: CancelSubscriptionStepInput, { container }) {
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
        "be cancelled",
        subscription.status
      )
    }

    const cancelledAt = new Date()
    const cancelEffectiveAt =
      input.effective_at === "end_of_cycle" && subscription.next_renewal_at
        ? subscription.next_renewal_at
        : cancelledAt

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      status: SubscriptionStatus.CANCELLED,
      cancelled_at: cancelledAt,
      cancel_effective_at: cancelEffectiveAt,
      next_renewal_at: null,
      metadata: {
        ...(subscription.metadata ?? {}),
        cancel_context: {
          reason: input.reason ?? null,
          effective_at: input.effective_at ?? "immediately",
          cancelled_at: cancelledAt.toISOString(),
        },
      },
    })

    return new StepResponse(updated, subscription)
  },
  async function (subscription, { container }) {
    if (!subscription) {
      return
    }

    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    await subscriptionModuleService.updateSubscriptions(subscription)
  }
)
