import type { MedusaContainer } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  SubscriptionStatus,
  type SubscriptionPaymentContext,
  type SubscriptionPaymentMethodSummary,
} from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import { resolveCustomerPaymentMethod } from "../../modules/subscription/utils/payment-methods"
import {
  asSubscriptionUpdateInput,
  asSubscriptionWorkflowRecord,
  SubscriptionWorkflowRecord,
} from "./pause-subscription"

export type UpdateSubscriptionPaymentMethodStepInput = {
  id: string
  payment_method_id: string
  provider_id?: string | null
  triggered_by?: string | null
}

export type UpdateSubscriptionPaymentMethodStepResult = {
  current: SubscriptionWorkflowRecord
  previous: SubscriptionWorkflowRecord
  previous_payment_method: SubscriptionPaymentMethodSummary | null
  current_payment_method: SubscriptionPaymentMethodSummary
}

const UPDATABLE_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.PAST_DUE,
]

export const updateSubscriptionPaymentMethodStep = createStep(
  "update-subscription-payment-method",
  async function (
    input: UpdateSubscriptionPaymentMethodStepInput,
    { container }
  ) {
    const subscriptionModuleService: SubscriptionModuleService =
      container.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionModuleService.retrieveSubscription(
      input.id
    )

    if (!UPDATABLE_STATUSES.includes(subscription.status as SubscriptionStatus)) {
      throw subscriptionErrors.invalidState(
        input.id,
        "update payment method",
        subscription.status
      )
    }

    if (!input.payment_method_id.trim()) {
      throw subscriptionErrors.invalidData("payment_method_id is required")
    }

    const paymentContext = (subscription.payment_context ??
      null) as SubscriptionPaymentContext | null
    const providerId =
      input.provider_id?.trim() || paymentContext?.payment_provider_id || null

    if (!providerId) {
      throw subscriptionErrors.invalidData(
        `Subscription '${input.id}' has no payment provider configured, so 'provider_id' is required`
      )
    }

    const resolved = await resolveCustomerPaymentMethod(container, {
      customer_id: subscription.customer_id,
      provider_id: providerId,
      payment_method_id: input.payment_method_id.trim(),
    })

    const previousPaymentMethod = await resolvePreviousPaymentMethod(
      container,
      subscription.customer_id,
      paymentContext
    )

    const updatedAt = new Date().toISOString()

    const updated = await subscriptionModuleService.updateSubscriptions({
      id: input.id,
      payment_context: {
        payment_provider_id: providerId,
        source_payment_collection_id:
          paymentContext?.source_payment_collection_id ?? null,
        source_payment_session_id:
          paymentContext?.source_payment_session_id ?? null,
        payment_method_reference: resolved.summary.id,
        customer_payment_reference:
          readAccountHolderReference(resolved.account_holder) ??
          paymentContext?.customer_payment_reference ??
          null,
      } satisfies SubscriptionPaymentContext,
      metadata: {
        ...(subscription.metadata ?? {}),
        payment_method_update_context: {
          triggered_by: input.triggered_by ?? null,
          updated_at: updatedAt,
        },
      },
    })

    return new StepResponse<
      UpdateSubscriptionPaymentMethodStepResult,
      SubscriptionWorkflowRecord
    >(
      {
        current: asSubscriptionWorkflowRecord(updated),
        previous: asSubscriptionWorkflowRecord(subscription),
        previous_payment_method: previousPaymentMethod,
        current_payment_method: resolved.summary,
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

/**
 * Resolves the card details of the currently stored payment method so the
 * activity log can record what the payment method was changed from.
 *
 * The provider lookup is best effort: a removed or unreachable payment method
 * must not block the update.
 */
async function resolvePreviousPaymentMethod(
  container: MedusaContainer,
  customerId: string,
  paymentContext: SubscriptionPaymentContext | null
): Promise<SubscriptionPaymentMethodSummary | null> {
  if (
    !paymentContext?.payment_provider_id ||
    !paymentContext.payment_method_reference
  ) {
    return null
  }

  try {
    const previous = await resolveCustomerPaymentMethod(container, {
      customer_id: customerId,
      provider_id: paymentContext.payment_provider_id,
      payment_method_id: paymentContext.payment_method_reference,
    })

    return previous.summary
  } catch {
    return {
      id: paymentContext.payment_method_reference,
      provider_id: paymentContext.payment_provider_id,
      type: null,
      brand: null,
      last4: null,
      exp_month: null,
      exp_year: null,
      created_at: null,
    }
  }
}

function readAccountHolderReference(accountHolder: {
  external_id?: string | null
  data?: Record<string, unknown> | null
}) {
  if (
    typeof accountHolder.external_id === "string" &&
    accountHolder.external_id.trim()
  ) {
    return accountHolder.external_id.trim()
  }

  const data = accountHolder.data ?? {}

  return typeof data.id === "string" && data.id.trim() ? data.id.trim() : null
}
