import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

export type PauseSubscriptionStepInput = {
  id: string
  reason?: string
  effective_at?: string
}

export const pauseSubscriptionStep = createStep(
  "pause-subscription",
  async function (input: PauseSubscriptionStepInput, { container }) {
    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionModuleService.retrieveSubscription(
      input.id
    )

    if (
      subscription.status !== SubscriptionStatus.ACTIVE &&
      subscription.status !== SubscriptionStatus.PAST_DUE
    ) {
      throw subscriptionErrors.invalidState(
        input.id,
        "be paused",
        subscription.status
      )
    }

    const pausedAt = input.effective_at
      ? new Date(input.effective_at)
      : new Date()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      status: SubscriptionStatus.PAUSED,
      paused_at: pausedAt,
      metadata: {
        ...(subscription.metadata ?? {}),
        pause_context: {
          reason: input.reason ?? null,
          effective_at: pausedAt.toISOString(),
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
