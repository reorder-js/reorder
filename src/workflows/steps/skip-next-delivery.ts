import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import {
  asSubscriptionUpdateInput,
  asSubscriptionWorkflowRecord,
  SubscriptionWorkflowRecord,
  SubscriptionWorkflowStepResult,
} from "./pause-subscription"

export type SkipNextDeliveryStepInput = {
  id: string
  triggered_by?: string | null
}

export const skipNextDeliveryStep = createStep(
  "skip-next-delivery",
  async function (input: SkipNextDeliveryStepInput, { container }) {
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
        "skip the next delivery",
        subscription.status
      )
    }

    if (subscription.skip_next_cycle) {
      throw subscriptionErrors.conflict(
        `Subscription '${input.id}' already has the next cycle skipped`
      )
    }

    const updatedAt = new Date().toISOString()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      skip_next_cycle: true,
      metadata: {
        ...(subscription.metadata ?? {}),
        skip_next_delivery_context: {
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
