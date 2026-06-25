import { IPaymentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { type OrderDTO, type PaymentCollectionDTO, BigNumberInput } from "@medusajs/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  createOrderWorkflow,
  type CreateOrderWorkflowInput,
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
import { normalizeActivityLogEvent } from "../../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../../modules/activity-log/types"
import { resolveProductSubscriptionConfig } from "../../modules/plan-offer/utils/effective-config"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  type SubscriptionPaymentContext,
  type SubscriptionSourceSnapshot,
  type SubscriptionType,
  SubscriptionPendingUpdateData,
  SubscriptionStatus,
} from "../../modules/subscription/types"
import { addSubscriptionCadence } from "../../modules/subscription/utils/effective-next-renewal"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import { startDunningWorkflow } from "../start-dunning"
import { persistSubscriptionLogEvent } from "./create-subscription-log-event"
import { toISOStringOrNull } from "../utils/date-output"
import type { FrequencyInterval } from "../../common/types/frequency-interval"

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
  reference: string
  status: SubscriptionStatus
  customer_id: string
  cart_id: string | null
  product_id: string
  variant_id: string
  frequency_interval: FrequencyInterval
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
  payment_context: SubscriptionPaymentContext | null
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

export type RenewalExecutionContext = {
  renewal_cycle_id: string
  subscription_id: string
  trigger_type: "scheduler" | "manual"
  triggered_by: string | null
  reason: string | null
  correlation_id: string
  operation_started_at: number
  attempt_id: string
  attempt_no: number
  applied_pending_changes: RenewalAppliedPendingUpdateData | null
  scheduled_for: string
  subscription: SubscriptionType
  cycle_previous_state: {
    status: RenewalCycleStatus
    attempt_count: number
    processed_at: string | null
    generated_order_id: string | null
    last_error: string | null
  }
}

export type RenewalOrderStepResult = {
  order: OrderDTO | null
  payment_collections: PaymentCollectionDTO[] | null
  generated_order_id: string | null
  resolved_source_snapshot: SubscriptionSourceSnapshot | null
  payment: {
    payment_collection_id: string
    payment_provider_id: string
    payment_method_id: string
    customer_id: string
  } | null
}

function getRenewalActivityLogActorType(triggerType: "scheduler" | "manual") {
  return triggerType === "manual"
    ? ActivityLogActorType.USER
    : ActivityLogActorType.SCHEDULER
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
): Promise<SubscriptionType> {
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

  try {
    return (await subscriptionModule.retrieveSubscription(
      id
    )) as SubscriptionType
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
  subscription: SubscriptionType
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
    sku: pending.sku ?? null,
    frequency_interval: pending.frequency_interval,
    frequency_value: pending.frequency_value,
    effective_at: pending.effective_at,
  }
}

async function loadOrderItemSnapshot(
  container: MedusaContainer,
  orderId: string,
  productId: string,
  variantId: string
): Promise<SubscriptionSourceSnapshot> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.title",
      "items.subtitle",
      "items.quantity",
      "items.unit_price",
      "items.product_id",
      "items.variant_id",
      "items.is_discountable",
      "items.is_tax_inclusive",
      "items.requires_shipping",
      "items.variant_sku",
      "items.tax_lines.code",
      "items.tax_lines.rate",
      "items.tax_lines.description",
      "items.adjustments.amount",
      "items.adjustments.code",
      "items.adjustments.description",
    ],
    filters: { id: orderId },
  })

  const order = orders[0]
  const item = order?.items?.[0]

  if (!item) {
    throw renewalErrors.invalidData(
      `Renewal order '${orderId}' has no line items to snapshot`
    )
  }

  return {
    product_id: item.product_id ?? productId,
    variant_id: item.variant_id ?? variantId,
    title: item.title,
    subtitle: item.subtitle ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    sku: item.variant_sku ?? null,
    is_discountable: item.is_discountable ?? null,
    is_tax_inclusive: item.is_tax_inclusive ?? null,
    requires_shipping: item.requires_shipping ?? null,
    tax_lines: item.tax_lines?.map((tl: any) => ({
      code: tl.code,
      rate: tl.rate,
      description: tl.description ?? null,
    })) ?? null,
    adjustments: item.adjustments?.map((adj: any) => ({
      amount: adj.amount,
      code: adj.code ?? null,
      description: adj.description ?? null,
    })) ?? null,
  }
}

function buildOrderItems(
  cart: CartRecord,
  subscription: SubscriptionType,
  appliedPendingChanges: RenewalAppliedPendingUpdateData | null
) {
  if (!subscription.source_snapshot) {
    throw renewalErrors.invalidData(
      `Subscription '${subscription.id}' is missing 'source_snapshot' required for renewal order creation`
    )
  }

  const sourceSnapshot = subscription.source_snapshot as SubscriptionSourceSnapshot
  const sourceItem =
    cart.items?.find((item) => item.variant_id === subscription.variant_id) ??
    cart.items?.[0]

  if (!sourceItem) {
    throw renewalErrors.invalidData(
      `Source cart '${cart.id}' doesn't contain any items for renewal`
    )
  }

  if (appliedPendingChanges) {
    return [
      {
        product_id: subscription.product_id,
        variant_id: appliedPendingChanges.variant_id,
        title: appliedPendingChanges.variant_title,
        variant_title: appliedPendingChanges.variant_title,
        variant_sku: appliedPendingChanges.sku ?? null,
        quantity: sourceSnapshot.quantity,
        requires_shipping: sourceSnapshot.requires_shipping ?? true,
        is_discountable: sourceSnapshot.is_discountable ?? true,
        metadata: {
          renewal_source_cart_id: cart.id,
        },
      },
    ] as any[]
  }

  return [
    {
      product_id: sourceSnapshot.product_id,
      variant_id: sourceSnapshot.variant_id ?? undefined,
      title: sourceSnapshot.title,
      subtitle: sourceSnapshot.subtitle,
      quantity: sourceSnapshot.quantity,
      unit_price: sourceSnapshot.unit_price,
      requires_shipping: sourceSnapshot.requires_shipping ?? true,
      is_discountable: sourceSnapshot.is_discountable ?? true,
      // TODO: to consider whether we should rerun tax calculation here?
      tax_lines: sourceSnapshot.tax_lines,
      // TODO: should all/some/any adjustments be preserved?
      adjustments: sourceSnapshot.adjustments,
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
  cycle: { id: string },
  subscription: SubscriptionType,
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
    } as unknown as CreateOrderWorkflowInput,
  })

  const order = orderResult.result
  const total = await loadOrderTotal(container, order.id)

  let paymentCollections: PaymentCollectionDTO[] | null = null
  let payment: RenewalOrderStepResult["payment"] = null

  if (total > 0) {
    const paymentContext = subscription.payment_context as SubscriptionPaymentContext

    if (
      !paymentContext?.payment_provider_id ||
      !paymentContext.payment_method_id
    ) {
      throw renewalErrors.renewalOrderCreationFailed(
        cycle.id,
        `Subscription '${subscription.id}' is missing renewal payment context`
      )
    }

    const paymentCollectionsResult =
      await createOrUpdateOrderPaymentCollectionWorkflow(container).run({
        input: {
          order_id: order.id,
          amount: total,
        },
      })

    const paymentCollection = paymentCollectionsResult.result[0]

    if (!paymentCollection) {
      throw renewalErrors.renewalOrderCreationFailed(
        cycle.id,
        `No payment collection was created for renewal order '${order.id}'`
      )
    }

    paymentCollections = paymentCollectionsResult.result
    payment = {
      payment_collection_id: paymentCollection.id,
      payment_provider_id: paymentContext.payment_provider_id,
      payment_method_id: paymentContext.payment_method_id,
      customer_id: subscription.customer_id,
    }
  }

  return {
    order,
    total,
    payment_collections: paymentCollections,
    payment,
  }
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

async function recordRenewalFailure(
  container: MedusaContainer,
  context: RenewalExecutionContext,
  error: unknown
): Promise<void> {
  const logger = container.resolve("logger")
  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

  const finishedAt = new Date()
  const message = getRenewalErrorMessage(error)
  const failureKind = classifyRenewalFailure(error)
  const paymentFailure = getPaymentQualifiedFailureContext(error)

  await renewalModule.updateRenewalAttempts({
    id: context.attempt_id,
    status: RenewalAttemptStatus.FAILED,
    finished_at: finishedAt,
    error_code: "renewal_failed",
    error_message: message,
    order_id: paymentFailure?.renewal_order_id ?? null,
  })

  await renewalModule.updateRenewalCycles({
    id: context.renewal_cycle_id,
    status: RenewalCycleStatus.FAILED,
    processed_at: finishedAt,
    generated_order_id: paymentFailure?.renewal_order_id ?? null,
    last_error: message,
  })

  const subscription = context.subscription

  await persistSubscriptionLogEvent(container, normalizeActivityLogEvent({
    subscription_id: subscription.id,
    customer_id: subscription.customer_id,
    event_type: ActivityLogEventType.RENEWAL_FAILED,
    actor_type: getRenewalActivityLogActorType(context.trigger_type),
    actor_id: context.triggered_by ?? null,
    display: {
      subscription_reference: subscription.reference,
      customer_name: subscription.customer_snapshot?.full_name ?? null,
      product_title: subscription.product_snapshot.product_title ?? null,
      variant_title:
        context.applied_pending_changes?.variant_title ??
        subscription.product_snapshot.variant_title ??
        null,
    },
    previous_state: {
      status: context.cycle_previous_state.status,
      attempt_count: context.cycle_previous_state.attempt_count,
      processed_at: context.cycle_previous_state.processed_at,
      generated_order_id: context.cycle_previous_state.generated_order_id,
      last_error: context.cycle_previous_state.last_error,
    },
    new_state: {
      status: RenewalCycleStatus.FAILED,
      attempt_count: context.attempt_no,
      processed_at: toISOStringOrNull(finishedAt),
      generated_order_id: paymentFailure?.renewal_order_id ?? null,
      last_error: message,
      applied_pending_update_data: context.applied_pending_changes,
    },
    reason: context.reason ?? null,
    metadata: {
      source: context.trigger_type === "manual" ? "admin" : "scheduler",
      renewal_cycle_id: context.renewal_cycle_id,
      order_id: paymentFailure?.renewal_order_id ?? null,
      trigger_type: context.trigger_type,
      reason_code: failureKind,
      scheduled_for: context.scheduled_for,
    },
    correlation_id: context.correlation_id,
    dedupe: {
      scope: "renewal",
      target_id: context.renewal_cycle_id,
      qualifier: toISOStringOrNull(finishedAt),
    },
  }))

  if (paymentFailure) {
    try {
      await startDunningWorkflow(container).run({
        input: {
          subscription_id: subscription.id,
          renewal_cycle_id: context.renewal_cycle_id,
          renewal_order_id: paymentFailure.renewal_order_id,
          payment_failure_source: paymentFailure.source,
          payment_error_code: paymentFailure.error_code,
          payment_error_message: message,
          failed_at: finishedAt,
          triggered_by: context.triggered_by ?? null,
          reason: context.reason ?? null,
          metadata: {
            renewal_trigger_type: context.trigger_type,
            renewal_attempt_id: context.attempt_id,
            renewal_attempt_no: context.attempt_no,
            renewal_correlation_id: context.correlation_id,
          },
        },
      })
    } catch (dunningError) {
      logRenewalEvent(logger, "warn", {
        event: "renewal.dunning",
        outcome: "failed",
        correlation_id: context.correlation_id,
        renewal_cycle_id: context.renewal_cycle_id,
        subscription_id: subscription.id,
        trigger_type: context.trigger_type,
        triggered_by: context.triggered_by ?? null,
        duration_ms: Date.now() - context.operation_started_at,
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
    correlation_id: context.correlation_id,
    renewal_cycle_id: context.renewal_cycle_id,
    subscription_id: subscription.id,
    trigger_type: context.trigger_type,
    triggered_by: context.triggered_by ?? null,
    attempt_no: context.attempt_no,
    duration_ms: Date.now() - context.operation_started_at,
    success_count: 0,
    failure_count: 1,
    failure_kind: failureKind,
    alertable: isAlertableRenewalFailure(failureKind),
    message,
  })
}

export const prepareRenewalCycleStep = createStep(
  "prepare-renewal-cycle",
  async function (
    input: ProcessRenewalCycleStepInput,
    { container }
  ) {
    const logger = container.resolve("logger")
    const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)
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
        subscription as unknown as SubscriptionRecord
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

    const context: RenewalExecutionContext = {
      renewal_cycle_id: cycle.id,
      subscription_id: subscription.id,
      trigger_type: input.trigger_type,
      triggered_by: input.triggered_by ?? null,
      reason: input.reason ?? null,
      correlation_id: correlationId,
      operation_started_at: operationStartedAt,
      attempt_id: attempt.id,
      attempt_no: attemptNo,
      applied_pending_changes: appliedPendingChanges,
      scheduled_for: cycle.scheduled_for.toISOString(),
      subscription,
      cycle_previous_state: {
        status: cycle.status,
        attempt_count: cycle.attempt_count,
        processed_at: toISOStringOrNull(cycle.processed_at),
        generated_order_id: cycle.generated_order_id,
        last_error: cycle.last_error,
      },
    }

    return new StepResponse(context)
  }
)

export const createRenewalOrderStep = createStep(
  "create-renewal-order",
  async function (
    context: RenewalExecutionContext,
    { container }
  ) {
    const subscription = context.subscription
    const appliedPendingChanges = context.applied_pending_changes

    if (subscription.skip_next_cycle) {
      return new StepResponse<RenewalOrderStepResult>({
        order: null,
        payment_collections: null,
        generated_order_id: null,
        resolved_source_snapshot: null,
        payment: null,
      })
    }

    try {
      if (!subscription.cart_id) {
        throw renewalErrors.invalidData(
          `Subscription '${subscription.id}' is missing 'cart_id' required for renewal order creation`
        )
      }

      const cart = await loadCart(container, subscription.cart_id)
      const { order, payment_collections, payment } = await createRenewalOrder(
        container,
        { id: context.renewal_cycle_id },
        subscription,
        cart,
        appliedPendingChanges
      )

      let resolvedSourceSnapshot: SubscriptionSourceSnapshot | null = null

      if (appliedPendingChanges) {
        resolvedSourceSnapshot = await loadOrderItemSnapshot(
          container,
          order.id,
          subscription.product_id,
          appliedPendingChanges.variant_id
        )
      }

      return new StepResponse<RenewalOrderStepResult>({
        order,
        payment_collections,
        generated_order_id: order.id,
        resolved_source_snapshot: resolvedSourceSnapshot,
        payment,
      })
    } catch (error) {
      await recordRenewalFailure(container, context, error)
      throw error
    }
  }
)

export const authorizeRenewalPaymentStep = createStep(
  "authorize-renewal-payment",
  async function (
    input: {
      context: RenewalExecutionContext
      order_result: RenewalOrderStepResult
      payment_session_data: Record<string, unknown> | undefined
    },
    { container }
  ) {
    const { context, order_result, payment_session_data } = input

    if (!order_result.payment) {
      return new StepResponse(void 0)
    }

    const orderId = order_result.order?.id as string

    try {
      const data =
        payment_session_data ?? {
          payment_method: order_result.payment.payment_method_id,
          off_session: true,
          confirm: true,
          capture_method: "automatic",
        }

      let paymentSessionResult: { result: PaymentSessionRecord }

      try {
        paymentSessionResult = await createPaymentSessionsWorkflow(container).run({
          input: {
            payment_collection_id: order_result.payment.payment_collection_id,
            provider_id: order_result.payment.payment_provider_id,
            customer_id: order_result.payment.customer_id,
            data,
          },
        })
      } catch (error) {
        throw createPaymentQualifiedRenewalError(
          error,
          "payment_session",
          orderId
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
          orderId
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
            orderId
          )
        }
      }
    } catch (error) {
      await recordRenewalFailure(container, context, error)
      throw error
    }

    return new StepResponse(void 0)
  }
)

export const finalizeRenewalCycleStep = createStep(
  "finalize-renewal-cycle",
  async function (
    input: {
      context: RenewalExecutionContext
      order_result: RenewalOrderStepResult
    },
    { container }
  ) {
    const logger = container.resolve("logger")
    const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    const { context, order_result } = input
    const subscription = context.subscription
    const appliedPendingChanges = context.applied_pending_changes
    const generatedOrderId = order_result.generated_order_id

    try {
      if (generatedOrderId) {
        const link = container.resolve(ContainerRegistrationKeys.LINK)

        await link.create({
          [RENEWAL_MODULE]: {
            renewal_cycle_id: context.renewal_cycle_id,
          },
          [Modules.ORDER]: {
            order_id: generatedOrderId,
          },
        })

        await link.create({
          [SUBSCRIPTION_MODULE]: {
            subscription_id: context.subscription_id,
          },
          [Modules.ORDER]: {
            order_id: generatedOrderId,
          },
        })
      }

      const scheduledAnchor = new Date(context.scheduled_for)
      const nextInterval =
        appliedPendingChanges?.frequency_interval ??
        subscription.frequency_interval
      const nextValue =
        appliedPendingChanges?.frequency_value ?? subscription.frequency_value
      const nextRenewalAt = addSubscriptionCadence(
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
            sku: appliedPendingChanges.sku ?? subscription.product_snapshot.sku,
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
        ...(order_result.resolved_source_snapshot ? { source_snapshot: order_result.resolved_source_snapshot } : {}),
      })

      const updatedCycle = await renewalModule.updateRenewalCycles({
        id: context.renewal_cycle_id,
        status: RenewalCycleStatus.SUCCEEDED,
        processed_at: finishedAt,
        generated_order_id: generatedOrderId,
        last_error: null,
      })

      await renewalModule.updateRenewalAttempts({
        id: context.attempt_id,
        status: RenewalAttemptStatus.SUCCEEDED,
        finished_at: finishedAt,
        order_id: generatedOrderId,
        error_code: null,
        error_message: null,
      })

      logRenewalEvent(logger, "info", {
        event: "renewal.execution",
        outcome: "succeeded",
        correlation_id: context.correlation_id,
        renewal_cycle_id: context.renewal_cycle_id,
        subscription_id: subscription.id,
        trigger_type: context.trigger_type,
        triggered_by: context.triggered_by ?? null,
        attempt_no: context.attempt_no,
        duration_ms: Date.now() - context.operation_started_at,
        success_count: 1,
        failure_count: 0,
        metadata: {
          generated_order_id: generatedOrderId,
          applied_pending_changes: Boolean(appliedPendingChanges),
        },
      })

      await persistSubscriptionLogEvent(container, normalizeActivityLogEvent({
        subscription_id: subscription.id,
        customer_id: subscription.customer_id,
        event_type: ActivityLogEventType.RENEWAL_SUCCEEDED,
        actor_type: getRenewalActivityLogActorType(context.trigger_type),
        actor_id: context.triggered_by ?? null,
        display: {
          subscription_reference: subscription.reference,
          customer_name: subscription.customer_snapshot?.full_name ?? null,
          product_title: subscription.product_snapshot.product_title ?? null,
          variant_title:
            appliedPendingChanges?.variant_title ??
            subscription.product_snapshot.variant_title ??
            null,
        },
        previous_state: {
          status: context.cycle_previous_state.status,
          attempt_count: context.cycle_previous_state.attempt_count,
          processed_at: context.cycle_previous_state.processed_at,
          generated_order_id: context.cycle_previous_state.generated_order_id,
          last_error: context.cycle_previous_state.last_error,
        },
        new_state: {
          status: updatedCycle.status,
          attempt_count: updatedCycle.attempt_count,
          processed_at: toISOStringOrNull(updatedCycle.processed_at),
          generated_order_id: updatedCycle.generated_order_id,
          last_error: updatedCycle.last_error,
          applied_pending_update_data: appliedPendingChanges,
        },
        metadata: {
          source: context.trigger_type === "manual" ? "admin" : "scheduler",
          renewal_cycle_id: context.renewal_cycle_id,
          order_id: generatedOrderId,
          trigger_type: context.trigger_type,
          scheduled_for: context.scheduled_for,
        },
        correlation_id: context.correlation_id,
        dedupe: {
          scope: "renewal",
          target_id: context.renewal_cycle_id,
          qualifier: toISOStringOrNull(updatedCycle.processed_at),
        },
      }))

      return new StepResponse({
        renewal_cycle: updatedCycle,
        subscription_id: context.subscription_id,
        attempt_id: context.attempt_id,
        generated_order_id: generatedOrderId,
      })
    } catch (error) {
      await recordRenewalFailure(container, context, error)
      throw error
    }
  }
)
