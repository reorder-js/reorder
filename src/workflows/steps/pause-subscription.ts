import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  SubscriptionPendingUpdateData,
  SubscriptionShippingAddress,
  SubscriptionStatus,
} from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

export type PauseSubscriptionStepInput = {
  id: string
  reason?: string
  effective_at?: string
  triggered_by?: string | null
}

export type SubscriptionWorkflowRecord = {
  id: string
  reference: string
  status: SubscriptionStatus
  customer_id: string
  updated_at: Date
  next_renewal_at: Date | null
  paused_at: Date | null
  cancelled_at: Date | null
  cancel_effective_at: Date | null
  shipping_address: SubscriptionShippingAddress
  pending_update_data: SubscriptionPendingUpdateData | null
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
  metadata: Record<string, unknown> | null
}

export type SubscriptionWorkflowStepResult = {
  current: SubscriptionWorkflowRecord
  previous: SubscriptionWorkflowRecord
}

type SubscriptionUpdateInput = Parameters<
  SubscriptionModuleService["updateSubscriptions"]
>[0]

export function asSubscriptionWorkflowRecord(
  subscription: unknown
): SubscriptionWorkflowRecord {
  return subscription as SubscriptionWorkflowRecord
}

export function asSubscriptionUpdateInput(
  subscription: SubscriptionWorkflowRecord
): SubscriptionUpdateInput {
  return subscription as unknown as SubscriptionUpdateInput
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
          triggered_by: input.triggered_by ?? null,
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
