import { IPaymentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { BigNumberInput } from "@medusajs/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  createOrderWorkflow,
  createOrUpdateOrderPaymentCollectionWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import {
  RenewalAppliedPendingUpdateData,
  RenewalApprovalStatus,
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../../modules/renewal/types"
import { renewalErrors } from "../../modules/renewal/utils/errors"
import {
  classifyRenewalFailure,
  createRenewalCorrelationId,
  getRenewalErrorMessage,
  isAlertableRenewalFailure,
  logRenewalEvent,
} from "../../modules/renewal/utils/observability"
import { resolveProductSubscriptionConfig } from "../../modules/plan-offer/utils/effective-config"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionPendingUpdateData,
  SubscriptionStatus,
} from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import { startDunningWorkflow } from "../start-dunning"

type CartRecord = {
  id: string
  region_id: string | null
  sales_channel_id: string | null
  currency_code: string
  email: string | null
  customer_id: string | null
  shipping_address: Record<string, unknown> | null
  billing_address: Record<string, unknown> | null
  items?: Array<Record<string, any>>
  shipping_methods?: Array<Record<string, any>>
}

type OrderRecord = {
  id: string
  total?: number | string | null
}

type PaymentSessionRecord = {
  id: string
  context?: Record<string, unknown> | null
}

type PaymentRecord = {
  id: string
  amount: BigNumberInput
}

type SubscriptionRecord = {
  id: string
  status: SubscriptionStatus
  customer_id: string
  cart_id: string | null
  product_id: string
  variant_id: string
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  next_renewal_at: Date | null
  last_renewal_at: Date | null
  paused_at: Date | null
  cancelled_at: Date | null
  cancel_effective_at: Date | null
  skip_next_cycle: boolean
  is_trial: boolean
  trial_ends_at: Date | null
  customer_snapshot: {
    email?: string
    full_name?: string | null
  } | null
  product_snapshot: {
    product_id: string
    product_title: string
    variant_id: string
    variant_title: string
    sku: string | null
  }
  shipping_address: Record<string, unknown>
  pending_update_data: SubscriptionPendingUpdateData | null
  payment_context: {
    payment_provider_id: string | null
    source_payment_collection_id: string | null
    source_payment_session_id: string | null
    payment_method_reference: string | null
    customer_payment_reference: string | null
  } | null
  metadata: Record<string, unknown> | null
}

export type ProcessRenewalCycleStepInput = {
  renewal_cycle_id: string
  trigger_type: "scheduler" | "manual"
  triggered_by?: string | null
  reason?: string | null
  correlation_id?: string | null
}

type RenewalCycleRecord = {
  id: string
  subscription_id: string
  scheduled_for: Date
  processed_at: Date | null
  status: RenewalCycleStatus
  approval_required: boolean
  approval_status: RenewalApprovalStatus | null
  approval_decided_at: Date | null
  approval_decided_by: string | null
  approval_reason: string | null
  generated_order_id: string | null
  applied_pending_update_data: RenewalAppliedPendingUpdateData | null
  last_error: string | null
  attempt_count: number
  metadata: Record<string, unknown> | null
}

type PaymentQualifiedFailureSource =
  | "payment_session"
  | "payment_provider"
  | "payment_capture"

type PaymentQualifiedRenewalError = Error & {
  dunning_payment_failure_source?: PaymentQualifiedFailureSource
  dunning_payment_error_code?: string | null
  dunning_renewal_order_id?: string | null
}

function addCadence(
  anchor: Date,
  interval: SubscriptionFrequencyInterval,
  value: number
) {
  const next = new Date(anchor)

  if (interval === SubscriptionFrequencyInterval.WEEK) {
    next.setUTCDate(next.getUTCDate() + value * 7)
    return next
  }

  if (interval === SubscriptionFrequencyInterval.MONTH) {
    next.setUTCMonth(next.getUTCMonth() + value)
    return next
  }

  next.setUTCFullYear(next.getUTCFullYear() + value)
  return next
}

function isPendingUpdateApplicable(
  scheduledFor: Date,
  pendingUpdateData: SubscriptionPendingUpdateData | null
) {
  if (!pendingUpdateData) {
    return false
  }

  if (!pendingUpdateData.effective_at) {
    return true
  }

  return new Date(pendingUpdateData.effective_at) <= scheduledFor
}

async function loadCycle(
  container: MedusaContainer,
  id: string
): Promise<RenewalCycleRecord> {
  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

  try {
    return (await renewalModule.retrieveRenewalCycle(
      id
    )) as unknown as RenewalCycleRecord
  } catch {
    throw renewalErrors.notFound("RenewalCycle", id)
  }
}

async function loadSubscription(
  container: MedusaContainer,
  id: string
): Promise<SubscriptionRecord> {
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

  try {
    return (await subscriptionModule.retrieveSubscription(
      id
    )) as unknown as SubscriptionRecord
  } catch {
    throw subscriptionErrors.notFound("Subscription", id)
  }
}

async function loadCart(
  container: MedusaContainer,
  id: string
): Promise<CartRecord> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "region_id",
      "sales_channel_id",
      "currency_code",
      "email",
      "customer_id",
      "shipping_address.*",
      "billing_address.*",
      "items.*",
      "shipping_methods.*",
    ],
    filters: {
      id: [id],
    },
  })

  const cart = (data as CartRecord[])[0]

  if (!cart) {
    throw renewalErrors.notFound("Cart", id)
  }

  return cart
}

async function loadOrderTotal(
  container: MedusaContainer,
  id: string
): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "total"],
    filters: {
      id: [id],
    },
  })

  const order = (data as OrderRecord[])[0]

  if (!order) {
    throw renewalErrors.notFound("Order", id)
  }

  return Number(order.total ?? 0)
}

async function validateSubscriptionEligibility(
  container: MedusaContainer,
  cycle: RenewalCycleRecord,
  subscription: SubscriptionRecord
) {
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw subscriptionErrors.invalidState(
      subscription.id,
      "renew",
      subscription.status
    )
  }

  if (subscription.paused_at) {
    throw renewalErrors.subscriptionNotEligible(
      subscription.id,
      "subscription is paused"
    )
  }

  if (
    subscription.cancel_effective_at &&
    subscription.cancel_effective_at <= cycle.scheduled_for
  ) {
    throw renewalErrors.subscriptionNotEligible(
      subscription.id,
      `cancel is effective for renewal date '${cycle.scheduled_for.toISOString()}'`
    )
  }

  if (
    subscription.is_trial &&
    subscription.trial_ends_at &&
    cycle.scheduled_for < subscription.trial_ends_at
  ) {
    throw renewalErrors.subscriptionNotEligible(
      subscription.id,
      `subscription is still in trial for renewal date '${cycle.scheduled_for.toISOString()}'`
    )
  }
}

async function resolveAppliedPendingChanges(
  container: MedusaContainer,
  cycle: RenewalCycleRecord,
  subscription: SubscriptionRecord
): Promise<RenewalAppliedPendingUpdateData | null> {
  if (
    !isPendingUpdateApplicable(cycle.scheduled_for, subscription.pending_update_data)
  ) {
    return null
  }

  if (cycle.approval_required) {
    if (cycle.approval_status !== RenewalApprovalStatus.APPROVED) {
      throw renewalErrors.invalidTransition(
        cycle.id,
        `Renewal '${cycle.id}' requires approval before pending changes can be applied`
      )
    }
  }

  const pending = subscription.pending_update_data

  if (!pending) {
    return null
  }

  const effectiveConfig = await resolveProductSubscriptionConfig(container, {
    product_id: subscription.product_id,
    variant_id: pending.variant_id,
  })

  if (!effectiveConfig.is_enabled) {
    throw subscriptionErrors.planChangeNotAllowed(
      subscription.product_id,
      pending.variant_id
    )
  }

  const isAllowedFrequency = effectiveConfig.allowed_frequencies.some(
    (frequency) =>
      String(frequency.interval) === pending.frequency_interval &&
      frequency.value === pending.frequency_value
  )

  if (!isAllowedFrequency) {
    throw subscriptionErrors.planChangeFrequencyNotAllowed(
      pending.frequency_interval,
      pending.frequency_value
    )
  }

  return {
    variant_id: pending.variant_id,
    variant_title: pending.variant_title,
    frequency_interval: pending.frequency_interval,
    frequency_value: pending.frequency_value,
    effective_at: pending.effective_at,
  }
}

function buildOrderItems(
  cart: CartRecord,
  subscription: SubscriptionRecord,
  appliedPendingChanges: RenewalAppliedPendingUpdateData | null
) {
  const sourceItem =
    cart.items?.find((item) => item.variant_id === subscription.variant_id) ??
    cart.items?.[0]

  if (!sourceItem) {
    throw renewalErrors.invalidData(
      `Source cart '${cart.id}' doesn't contain any items for renewal`
    )
  }

  const variantId = appliedPendingChanges?.variant_id ?? subscription.variant_id
  const variantTitle =
    appliedPendingChanges?.variant_title ??
    sourceItem.variant_title ??
    subscription.product_snapshot.variant_title

  return [
    {
      title: sourceItem.title ?? variantTitle,
      quantity: sourceItem.quantity ?? 1,
      product_id: subscription.product_id,
      product_title: subscription.product_snapshot.product_title,
      variant_id: variantId,
      variant_title: variantTitle,
      variant_sku:
        sourceItem.variant_sku ??
        subscription.pending_update_data?.sku ??
        subscription.product_snapshot.sku ??
        undefined,
      requires_shipping: sourceItem.requires_shipping ?? true,
      is_discountable: sourceItem.is_discountable ?? true,
      metadata: {
        renewal_source_cart_id: cart.id,
      },
    },
  ] as any[]
}

function buildShippingMethods(cart: CartRecord) {
  return (
    cart.shipping_methods?.map((method) => ({
      name: method.name,
      amount: method.amount,
      is_tax_inclusive: method.is_tax_inclusive,
      shipping_option_id: method.shipping_option_id,
      data: method.data,
    })) ?? []
  ) as any[]
}

async function createRenewalOrder(
  container: MedusaContainer,
  cycle: RenewalCycleRecord,
  subscription: SubscriptionRecord,
  cart: CartRecord,
  appliedPendingChanges: RenewalAppliedPendingUpdateData | null
) {
  if (!cart.region_id) {
    throw renewalErrors.invalidData(
      `Source cart '${cart.id}' is missing 'region_id'`
    )
  }

  if (!cart.sales_channel_id) {
    throw renewalErrors.invalidData(
      `Source cart '${cart.id}' is missing 'sales_channel_id'`
    )
  }

  const orderResult = await createOrderWorkflow(container).run({
    input: {
      region_id: cart.region_id,
      sales_channel_id: cart.sales_channel_id,
      customer_id: subscription.customer_id,
      email: cart.email ?? subscription.customer_snapshot?.email ?? undefined,
      currency_code: cart.currency_code,
      shipping_address: cart.shipping_address ?? subscription.shipping_address,
      billing_address: cart.billing_address ?? undefined,
      items: buildOrderItems(cart, subscription, appliedPendingChanges),
      shipping_methods: buildShippingMethods(cart),
      metadata: {
        renewal_cycle_id: cycle.id,
        subscription_id: subscription.id,
        renewal_trigger: "automatic",
      },
    } as any,
  })

  const order = orderResult.result
  const total = await loadOrderTotal(container, order.id)

  if (total > 0) {
    const paymentContext = subscription.payment_context

    if (
      !paymentContext?.payment_provider_id ||
      !paymentContext.payment_method_reference
    ) {
      throw renewalErrors.renewalOrderCreationFailed(
        cycle.id,
        `Subscription '${subscription.id}' is missing renewal payment context`
      )
    }

    const paymentCollections =
      await createOrUpdateOrderPaymentCollectionWorkflow(container).run({
        input: {
          order_id: order.id,
          amount: total,
        },
      })

    const paymentCollection = paymentCollections.result[0]

    if (!paymentCollection) {
      throw renewalErrors.renewalOrderCreationFailed(
        cycle.id,
        `No payment collection was created for renewal order '${order.id}'`
      )
    }

    let paymentSessionResult: { result: PaymentSessionRecord }

    try {
      paymentSessionResult = await createPaymentSessionsWorkflow(container).run({
        input: {
          payment_collection_id: paymentCollection.id,
          provider_id: paymentContext.payment_provider_id,
          customer_id: subscription.customer_id,
          data: {
            payment_method: paymentContext.payment_method_reference,
            off_session: true,
            confirm: true,
            capture_method: "automatic",
          },
        },
      })
    } catch (error) {
      throw createPaymentQualifiedRenewalError(
        error,
        "payment_session",
        order.id
      )
    }

    const paymentModule =
      container.resolve<IPaymentModuleService>(Modules.PAYMENT)
    let payment: PaymentRecord | undefined | null

    try {
      payment = await paymentModule.authorizePaymentSession(
        paymentSessionResult.result.id,
        paymentSessionResult.result.context ?? {}
      )
    } catch (error) {
      throw createPaymentQualifiedRenewalError(
        error,
        "payment_provider",
        order.id
      )
    }

    if (payment?.id) {
      try {
        await paymentModule.capturePayment({
          payment_id: payment.id,
          amount: payment.amount,
        })
      } catch (error) {
        throw createPaymentQualifiedRenewalError(
          error,
          "payment_capture",
          order.id
        )
      }
    }
  }

  const link = container.resolve(ContainerRegistrationKeys.LINK)

  await link.create({
    [RENEWAL_MODULE]: {
      renewal_cycle_id: cycle.id,
    },
    [Modules.ORDER]: {
      order_id: order.id,
    },
  })

  await link.create({
    [SUBSCRIPTION_MODULE]: {
      subscription_id: subscription.id,
    },
    [Modules.ORDER]: {
      order_id: order.id,
    },
  })

  return order
}

function createPaymentQualifiedRenewalError(
  error: unknown,
  source: PaymentQualifiedFailureSource,
  renewalOrderId: string
): PaymentQualifiedRenewalError {
  const message = getRenewalErrorMessage(error)
  const nextError =
    error instanceof Error ? error : new Error(message)

  const typedError = nextError as PaymentQualifiedRenewalError
  typedError.dunning_payment_failure_source = source
  typedError.dunning_payment_error_code = null
  typedError.dunning_renewal_order_id = renewalOrderId

  return typedError
}

function getPaymentQualifiedFailureContext(
  error: unknown
): {
  source: PaymentQualifiedFailureSource
  error_code: string | null
  renewal_order_id: string | null
} | null {
  if (!error || typeof error !== "object") {
    return null
  }

  const typedError = error as PaymentQualifiedRenewalError

  if (!typedError.dunning_payment_failure_source) {
    return null
  }

  return {
    source: typedError.dunning_payment_failure_source,
    error_code: typedError.dunning_payment_error_code ?? null,
    renewal_order_id: typedError.dunning_renewal_order_id ?? null,
  }
}

export const processRenewalCycleStep = createStep(
  "process-renewal-cycle",
  async function (
    input: ProcessRenewalCycleStepInput,
    { container }
  ) {
    const logger = container.resolve("logger")
    const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
    const operationStartedAt = Date.now()
    const correlationId =
      input.correlation_id ??
      createRenewalCorrelationId(`renewal-${input.trigger_type}`)

    const cycle = await loadCycle(container, input.renewal_cycle_id)

    if (cycle.status === RenewalCycleStatus.PROCESSING) {
      throw renewalErrors.alreadyProcessing(cycle.id)
    }

    if (cycle.status === RenewalCycleStatus.SUCCEEDED) {
      throw renewalErrors.duplicateExecutionBlocked(cycle.id)
    }

    const subscription = await loadSubscription(container, cycle.subscription_id)

    logRenewalEvent(logger, "info", {
      event: "renewal.execution",
      outcome: "started",
      correlation_id: correlationId,
      renewal_cycle_id: cycle.id,
      subscription_id: subscription.id,
      trigger_type: input.trigger_type,
      triggered_by: input.triggered_by ?? null,
      metadata: {
        scheduled_for: cycle.scheduled_for.toISOString(),
        approval_required: cycle.approval_required,
        approval_status: cycle.approval_status,
      },
    })

    let appliedPendingChanges: RenewalAppliedPendingUpdateData | null = null

    try {
      await validateSubscriptionEligibility(container, cycle, subscription)

      appliedPendingChanges = await resolveAppliedPendingChanges(
        container,
        cycle,
        subscription
      )
    } catch (error) {
      const failureKind = classifyRenewalFailure(error)

      logRenewalEvent(logger, "warn", {
        event: "renewal.execution",
        outcome: "blocked",
        correlation_id: correlationId,
        renewal_cycle_id: cycle.id,
        subscription_id: subscription.id,
        trigger_type: input.trigger_type,
        triggered_by: input.triggered_by ?? null,
        duration_ms: Date.now() - operationStartedAt,
        failure_kind: failureKind,
        alertable: isAlertableRenewalFailure(failureKind),
        message: getRenewalErrorMessage(error),
      })

      throw error
    }

    const attemptNo = cycle.attempt_count + 1
    const startedAt = new Date()

    const attempt = await renewalModule.createRenewalAttempts({
      renewal_cycle_id: cycle.id,
      attempt_no: attemptNo,
      started_at: startedAt,
      status: RenewalAttemptStatus.PROCESSING,
      error_code: null,
      error_message: null,
      payment_reference: null,
      order_id: null,
      metadata: {
        trigger_type: input.trigger_type,
        triggered_by: input.triggered_by ?? null,
        reason: input.reason ?? null,
      },
    })

    await renewalModule.updateRenewalCycles({
      id: cycle.id,
      status: RenewalCycleStatus.PROCESSING,
      attempt_count: attemptNo,
      last_error: null,
      applied_pending_update_data: appliedPendingChanges,
      metadata: {
        ...(cycle.metadata ?? {}),
        last_trigger_type: input.trigger_type,
        last_triggered_by: input.triggered_by ?? null,
        last_trigger_reason: input.reason ?? null,
        last_correlation_id: correlationId,
      },
    })

    try {
      const scheduledAnchor = new Date(cycle.scheduled_for)
      let generatedOrderId: string | null = null

      if (!subscription.skip_next_cycle) {
        if (!subscription.cart_id) {
          throw renewalErrors.invalidData(
            `Subscription '${subscription.id}' is missing 'cart_id' required for renewal order creation`
          )
        }

        const cart = await loadCart(container, subscription.cart_id)
        const order = await createRenewalOrder(
          container,
          cycle,
          subscription,
          cart,
          appliedPendingChanges
        )

        generatedOrderId = order.id
      }

      const nextInterval =
        appliedPendingChanges?.frequency_interval ??
        subscription.frequency_interval
      const nextValue =
        appliedPendingChanges?.frequency_value ?? subscription.frequency_value
      const nextRenewalAt = addCadence(
        scheduledAnchor,
        nextInterval,
        nextValue
      )
      const finishedAt = new Date()

      const nextProductSnapshot = appliedPendingChanges
        ? {
            ...subscription.product_snapshot,
            variant_id: appliedPendingChanges.variant_id,
            variant_title: appliedPendingChanges.variant_title,
            sku: subscription.pending_update_data?.sku ?? subscription.product_snapshot.sku,
          }
        : subscription.product_snapshot

      await subscriptionModule.updateSubscriptions({
        id: subscription.id,
        variant_id:
          appliedPendingChanges?.variant_id ?? subscription.variant_id,
        frequency_interval: nextInterval,
        frequency_value: nextValue,
        product_snapshot: nextProductSnapshot,
        next_renewal_at: nextRenewalAt,
        last_renewal_at: finishedAt,
        skip_next_cycle: false,
        pending_update_data: appliedPendingChanges ? null : subscription.pending_update_data,
      })

      const updatedCycle = await renewalModule.updateRenewalCycles({
        id: cycle.id,
        status: RenewalCycleStatus.SUCCEEDED,
        processed_at: finishedAt,
        generated_order_id: generatedOrderId,
        last_error: null,
      })

      await renewalModule.updateRenewalAttempts({
        id: attempt.id,
        status: RenewalAttemptStatus.SUCCEEDED,
        finished_at: finishedAt,
        order_id: generatedOrderId,
        error_code: null,
        error_message: null,
      })

      logRenewalEvent(logger, "info", {
        event: "renewal.execution",
        outcome: "succeeded",
        correlation_id: correlationId,
        renewal_cycle_id: cycle.id,
        subscription_id: subscription.id,
        trigger_type: input.trigger_type,
        triggered_by: input.triggered_by ?? null,
        attempt_no: attemptNo,
        duration_ms: Date.now() - operationStartedAt,
        success_count: 1,
        failure_count: 0,
        metadata: {
          generated_order_id: generatedOrderId,
          applied_pending_changes: Boolean(appliedPendingChanges),
        },
      })

      return new StepResponse({
        renewal_cycle: updatedCycle,
        subscription_id: subscription.id,
        attempt_id: attempt.id,
        generated_order_id: generatedOrderId,
      })
    } catch (error) {
      const finishedAt = new Date()
      const message = getRenewalErrorMessage(error)
      const failureKind = classifyRenewalFailure(error)
      const paymentFailure = getPaymentQualifiedFailureContext(error)

      await renewalModule.updateRenewalAttempts({
        id: attempt.id,
        status: RenewalAttemptStatus.FAILED,
        finished_at: finishedAt,
        error_code: "renewal_failed",
        error_message: message,
        order_id: paymentFailure?.renewal_order_id ?? null,
      })

      await renewalModule.updateRenewalCycles({
        id: cycle.id,
        status: RenewalCycleStatus.FAILED,
        processed_at: finishedAt,
        generated_order_id: paymentFailure?.renewal_order_id ?? null,
        last_error: message,
      })

      if (paymentFailure) {
        try {
          await startDunningWorkflow(container).run({
            input: {
              subscription_id: subscription.id,
              renewal_cycle_id: cycle.id,
              renewal_order_id: paymentFailure.renewal_order_id,
              payment_failure_source: paymentFailure.source,
              payment_error_code: paymentFailure.error_code,
              payment_error_message: message,
              failed_at: finishedAt,
              triggered_by: input.triggered_by ?? null,
              reason: input.reason ?? null,
              metadata: {
                renewal_trigger_type: input.trigger_type,
                renewal_attempt_id: attempt.id,
                renewal_attempt_no: attemptNo,
                renewal_correlation_id: correlationId,
              },
            },
          })
        } catch (dunningError) {
          logRenewalEvent(logger, "warn", {
            event: "renewal.dunning",
            outcome: "failed",
            correlation_id: correlationId,
            renewal_cycle_id: cycle.id,
            subscription_id: subscription.id,
            trigger_type: input.trigger_type,
            triggered_by: input.triggered_by ?? null,
            duration_ms: Date.now() - operationStartedAt,
            failure_kind: failureKind,
            alertable: true,
            message: `Failed to start dunning after renewal failure: ${getRenewalErrorMessage(
              dunningError
            )}`,
          })
        }
      }

      logRenewalEvent(logger, "error", {
        event: "renewal.execution",
        outcome: "failed",
        correlation_id: correlationId,
        renewal_cycle_id: cycle.id,
        subscription_id: subscription.id,
        trigger_type: input.trigger_type,
        triggered_by: input.triggered_by ?? null,
        attempt_no: attemptNo,
        duration_ms: Date.now() - operationStartedAt,
        success_count: 0,
        failure_count: 1,
        failure_kind: failureKind,
        alertable: isAlertableRenewalFailure(failureKind),
        message,
      })

      throw error
    }
  }
)
