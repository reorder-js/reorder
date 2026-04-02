import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { resolveProductSubscriptionConfig } from "../../modules/plan-offer/utils/effective-config"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionFrequencyInterval, SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import {
  asSubscriptionUpdateInput,
  asSubscriptionWorkflowRecord,
  SubscriptionWorkflowRecord,
  SubscriptionWorkflowStepResult,
} from "./pause-subscription"

export type ScheduleSubscriptionPlanChangeStepInput = {
  id: string
  variant_id: string
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  effective_at?: string
  requested_by?: string | null
}

export const scheduleSubscriptionPlanChangeStep = createStep(
  "schedule-subscription-plan-change",
  async function (
    input: ScheduleSubscriptionPlanChangeStepInput,
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
        "schedule a plan change",
        subscription.status
      )
    }

    if (input.frequency_value <= 0) {
      throw subscriptionErrors.invalidData(
        "frequency_value must be greater than 0"
      )
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: variants } = await query.graph({
      entity: "variant",
      fields: ["id", "title", "sku", "product.id", "product.title"],
      filters: {
        id: [input.variant_id],
      },
    })

    const variant = variants[0]

    if (!variant) {
      throw subscriptionErrors.notFound("Variant", input.variant_id)
    }

    if (variant.product?.id !== subscription.product_id) {
      throw subscriptionErrors.planChangeVariantMismatch(
        input.variant_id,
        subscription.product_id
      )
    }

    const effectiveConfig = await resolveProductSubscriptionConfig(container, {
      product_id: subscription.product_id,
      variant_id: variant.id,
    })

    if (!effectiveConfig.is_enabled) {
      throw subscriptionErrors.planChangeNotAllowed(
        subscription.product_id,
        variant.id
      )
    }

    const isAllowedFrequency = effectiveConfig.allowed_frequencies.some(
      (frequency) =>
        String(frequency.interval) === input.frequency_interval &&
        frequency.value === input.frequency_value
    )

    if (!isAllowedFrequency) {
      throw subscriptionErrors.planChangeFrequencyNotAllowed(
        input.frequency_interval,
        input.frequency_value
      )
    }

    const requestedAt = new Date().toISOString()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      pending_update_data: {
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku ?? null,
        frequency_interval: input.frequency_interval,
        frequency_value: input.frequency_value,
        effective_at: input.effective_at ?? null,
        requested_at: requestedAt,
        requested_by: input.requested_by ?? null,
      },
      metadata: {
        ...(subscription.metadata ?? {}),
        scheduled_plan_change_context: {
          requested_at: requestedAt,
          requested_by: input.requested_by ?? null,
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
