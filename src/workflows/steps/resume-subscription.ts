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

export type ResumeSubscriptionStepInput = {
  id: string
  resume_at?: string
  preserve_billing_anchor?: boolean
  triggered_by?: string | null
}

export const resumeSubscriptionStep = createStep(
  "resume-subscription",
  async function (input: ResumeSubscriptionStepInput, { container }) {
    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionModuleService.retrieveSubscription(
      input.id
    )

    if (subscription.status !== SubscriptionStatus.PAUSED) {
      throw subscriptionErrors.invalidState(
        input.id,
        "be resumed",
        subscription.status
      )
    }

    const nextRenewalAt = input.resume_at
      ? new Date(input.resume_at)
      : input.preserve_billing_anchor
      ? subscription.next_renewal_at
      : subscription.next_renewal_at ?? new Date()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      status: SubscriptionStatus.ACTIVE,
      paused_at: null,
      next_renewal_at: nextRenewalAt,
      metadata: {
        ...(subscription.metadata ?? {}),
        resume_context: {
          resume_at: input.resume_at ?? null,
          preserve_billing_anchor: input.preserve_billing_anchor ?? false,
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
