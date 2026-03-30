import { IPaymentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  createOrUpdateOrderPaymentCollectionWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../../modules/dunning/types"
import { dunningErrors } from "../../modules/dunning/utils/errors"
import { calculateNextRetryAt } from "../../modules/dunning/utils/retry-schedule"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

type SubscriptionRecord = {
  id: string
  status: SubscriptionStatus
  customer_id: string
  payment_context: {
    payment_provider_id: string | null
    payment_method_reference: string | null
  } | null
}

type DunningCaseRecord = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: Date | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: Date | null
  recovered_at: Date | null
  closed_at: Date | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
}

type DunningAttemptRecord = {
  id: string
  dunning_case_id: string
  attempt_no: number
  started_at: Date
  finished_at: Date | null
  status: DunningAttemptStatus
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  metadata: Record<string, unknown> | null
}

type OrderRecord = {
  id: string
  total?: number | string | null
}

type PaymentSessionRecord = {
  id: string
  status?: string | null
  context?: Record<string, unknown> | null
}

type PaymentRecord = {
  id: string
  amount: number
}

type PaymentRetryOutcome =
  | {
      kind: "recovery"
      payment_reference: string | null
      error_code: null
      error_message: null
    }
  | {
      kind: "temporary_failure" | "permanent_failure"
      payment_reference: string | null
      error_code: string
      error_message: string
    }

export type RunDunningRetryStepInput = {
  dunning_case_id: string
  now?: string | Date | null
  ignore_schedule?: boolean
  triggered_by?: string | null
  reason?: string | null
}

type RunDunningRetryStepOutput = {
  dunning_case_id: string
  dunning_attempt_id: string
  outcome: "recovered" | "retry_scheduled" | "unrecovered"
  subscription_status: SubscriptionStatus
}

function appendRetryAuditMetadata(
  metadata: Record<string, unknown> | null,
  input: RunDunningRetryStepInput,
  at: string
) {
  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    last_retry_triggered_by: input.triggered_by ?? null,
    last_retry_reason: input.reason ?? null,
  }

  if (!input.ignore_schedule) {
    return nextMetadata
  }

  const existing = Array.isArray(metadata?.manual_actions)
    ? [...(metadata?.manual_actions as Record<string, unknown>[])]
    : []

  existing.push({
    action: "retry_now",
    who: input.triggered_by ?? null,
    when: at,
    reason: input.reason ?? null,
  })

  return {
    ...nextMetadata,
    manual_actions: existing,
    last_manual_action: existing[existing.length - 1],
  }
}

function normalizeNow(now?: string | Date | null) {
  if (!now) {
    return new Date()
  }

  const normalized = now instanceof Date ? now : new Date(now)

  if (Number.isNaN(normalized.getTime())) {
    throw dunningErrors.invalidData("Dunning retry 'now' must be a valid date")
  }

  return normalized
}

async function loadDunningCase(
  container: MedusaContainer,
  id: string
): Promise<DunningCaseRecord> {
  const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)

  try {
    return (await dunningModule.retrieveDunningCase(id)) as DunningCaseRecord
  } catch {
    throw dunningErrors.notFound("DunningCase", id)
  }
}

async function loadSubscription(
  container: MedusaContainer,
  id: string
): Promise<SubscriptionRecord> {
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

  try {
    return (await subscriptionModule.retrieveSubscription(id)) as SubscriptionRecord
  } catch {
    throw subscriptionErrors.notFound("Subscription", id)
  }
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
    throw dunningErrors.notFound("Order", id)
  }

  return Number(order.total ?? 0)
}

function validateRetryableCase(
  dunningCase: DunningCaseRecord,
  now: Date,
  ignoreSchedule?: boolean
) {
  if (
    dunningCase.status === DunningCaseStatus.RECOVERED ||
    dunningCase.status === DunningCaseStatus.UNRECOVERED
  ) {
    throw dunningErrors.conflict(
      `DunningCase '${dunningCase.id}' is already closed`
    )
  }

  if (dunningCase.status === DunningCaseStatus.RETRYING) {
    throw dunningErrors.conflict(
      `DunningCase '${dunningCase.id}' is already retrying`
    )
  }

  if (!dunningCase.renewal_order_id) {
    throw dunningErrors.invalidData(
      `DunningCase '${dunningCase.id}' is missing renewal_order_id`
    )
  }

  if (!dunningCase.retry_schedule) {
    throw dunningErrors.invalidData(
      `DunningCase '${dunningCase.id}' is missing retry_schedule`
    )
  }

  if (!ignoreSchedule && !dunningCase.next_retry_at) {
    throw dunningErrors.conflict(
      `DunningCase '${dunningCase.id}' doesn't have a scheduled retry`
    )
  }

  if (!ignoreSchedule && dunningCase.next_retry_at && dunningCase.next_retry_at > now) {
    throw dunningErrors.conflict(
      `DunningCase '${dunningCase.id}' is not due for retry yet`
    )
  }

  if (dunningCase.attempt_count >= dunningCase.max_attempts) {
    throw dunningErrors.conflict(
      `DunningCase '${dunningCase.id}' already exhausted retry attempts`
    )
  }
}

function classifyPaymentRetryFailure(
  error: unknown,
  paymentSessionStatus?: string | null
): PaymentRetryOutcome {
  const message =
    error instanceof Error ? error.message : "Dunning payment retry failed"
  const normalizedMessage = message.toLowerCase()
  const normalizedStatus = String(paymentSessionStatus ?? "").toLowerCase()

  if (
    normalizedStatus === "requires_more" ||
    normalizedStatus === "canceled" ||
    normalizedStatus === "cancelled"
  ) {
    return {
      kind: "permanent_failure",
      payment_reference: null,
      error_code: normalizedStatus || "payment_requires_manual_action",
      error_message: message,
    }
  }

  if (
    normalizedMessage.includes("missing payment retry context") ||
    normalizedMessage.includes("doesn't have a collectible total") ||
    normalizedMessage.includes("no payment collection is available") ||
    normalizedMessage.includes("expired") ||
    normalizedMessage.includes("insufficient") ||
    normalizedMessage.includes("declined") ||
    normalizedMessage.includes("do_not_honor") ||
    normalizedMessage.includes("requires payment method") ||
    normalizedMessage.includes("requires more")
  ) {
    return {
      kind: "permanent_failure",
      payment_reference: null,
      error_code: normalizedStatus || "payment_declined",
      error_message: message,
    }
  }

  if (
    normalizedStatus === "pending" ||
    normalizedStatus === "error" ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("temporar") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("unavailable")
  ) {
    return {
      kind: "temporary_failure",
      payment_reference: null,
      error_code: normalizedStatus || "payment_retryable_error",
      error_message: message,
    }
  }

  return {
    kind: "temporary_failure",
    payment_reference: null,
    error_code: normalizedStatus || "payment_retry_failed",
    error_message: message,
  }
}

async function executePaymentRetry(
  container: MedusaContainer,
  subscription: SubscriptionRecord,
  renewalOrderId: string
): Promise<PaymentRetryOutcome> {
  let paymentSession: PaymentSessionRecord | null = null

  try {
    const paymentContext = subscription.payment_context

    if (
      !paymentContext?.payment_provider_id ||
      !paymentContext.payment_method_reference
    ) {
      throw dunningErrors.invalidData(
        `Subscription '${subscription.id}' is missing payment retry context`
      )
    }

    const total = await loadOrderTotal(container, renewalOrderId)

    if (total <= 0) {
      throw dunningErrors.invalidData(
        `Renewal order '${renewalOrderId}' doesn't have a collectible total`
      )
    }

    const paymentCollections =
      await createOrUpdateOrderPaymentCollectionWorkflow(container).run({
        input: {
          order_id: renewalOrderId,
          amount: total,
        },
      })

    const paymentCollection = paymentCollections.result[0]

    if (!paymentCollection) {
      throw dunningErrors.invalidData(
        `No payment collection is available for renewal order '${renewalOrderId}'`
      )
    }

    const paymentSessionResult = await createPaymentSessionsWorkflow(container).run({
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

    paymentSession = paymentSessionResult.result as PaymentSessionRecord

    const paymentModule =
      container.resolve<IPaymentModuleService>(Modules.PAYMENT)
    const payment = (await paymentModule.authorizePaymentSession(
      paymentSession.id,
      paymentSession.context ?? {}
    )) as PaymentRecord | null

    if (!payment?.id) {
      return {
        kind: "temporary_failure",
        payment_reference: paymentSession.id,
        error_code: "payment_authorization_missing",
        error_message: "Payment authorization did not return a payment reference",
      }
    }

    await paymentModule.capturePayment({
      payment_id: payment.id,
      amount: payment.amount,
    })

    return {
      kind: "recovery",
      payment_reference: payment.id,
      error_code: null,
      error_message: null,
    }
  } catch (error) {
    let paymentSessionStatus: string | null = paymentSession?.status ?? null

    if (paymentSession?.id) {
      const paymentModule =
        container.resolve<IPaymentModuleService>(Modules.PAYMENT)
      const sessions = (await paymentModule.listPaymentSessions({
        id: [paymentSession.id],
      })) as PaymentSessionRecord[]

      paymentSessionStatus = sessions[0]?.status ?? paymentSessionStatus
    }

    const outcome = classifyPaymentRetryFailure(error, paymentSessionStatus)

    return {
      ...outcome,
      payment_reference: paymentSession?.id ?? outcome.payment_reference,
    }
  }
}

export const runDunningRetryStep = createStep(
  "run-dunning-retry",
  async function (
    input: RunDunningRetryStepInput,
    { container }
  ) {
    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
    const now = normalizeNow(input.now)

    const dunningCase = await loadDunningCase(container, input.dunning_case_id)
    validateRetryableCase(dunningCase, now, input.ignore_schedule)

    const subscription = await loadSubscription(
      container,
      dunningCase.subscription_id
    )

    if (
      subscription.status !== SubscriptionStatus.PAST_DUE &&
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      throw subscriptionErrors.invalidState(
        subscription.id,
        "run dunning retry",
        subscription.status
      )
    }

    const attemptNo = dunningCase.attempt_count + 1
    const startedAt = now

    await dunningModule.updateDunningCases({
      id: dunningCase.id,
      status: DunningCaseStatus.RETRYING,
      attempt_count: attemptNo,
      next_retry_at: null,
      last_attempt_at: startedAt,
      metadata: appendRetryAuditMetadata(
        dunningCase.metadata,
        input,
        startedAt.toISOString()
      ),
    } as any)

    const attempt = (await dunningModule.createDunningAttempts({
      dunning_case_id: dunningCase.id,
      attempt_no: attemptNo,
      started_at: startedAt,
      finished_at: null,
      status: DunningAttemptStatus.PROCESSING,
      error_code: null,
      error_message: null,
      payment_reference: null,
      metadata: {
        triggered_by: input.triggered_by ?? null,
        reason: input.reason ?? null,
      },
    } as any)) as DunningAttemptRecord

    const outcome = await executePaymentRetry(
      container,
      subscription,
      dunningCase.renewal_order_id!
    )
    const finishedAt = new Date()

    if (outcome.kind === "recovery") {
      await dunningModule.updateDunningAttempts({
        id: attempt.id,
        finished_at: finishedAt,
        status: DunningAttemptStatus.SUCCEEDED,
        error_code: null,
        error_message: null,
        payment_reference: outcome.payment_reference,
      } as any)

      const updatedCase = await dunningModule.updateDunningCases({
        id: dunningCase.id,
        status: DunningCaseStatus.RECOVERED,
        next_retry_at: null,
        last_attempt_at: finishedAt,
        last_payment_error_code: null,
        last_payment_error_message: null,
        recovered_at: finishedAt,
        closed_at: finishedAt,
        recovery_reason: "payment_recovered",
      } as any)

      if (subscription.status === SubscriptionStatus.PAST_DUE) {
        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          status: SubscriptionStatus.ACTIVE,
        })
      }

      return new StepResponse<RunDunningRetryStepOutput>({
        dunning_case_id: updatedCase.id,
        dunning_attempt_id: attempt.id,
        outcome: "recovered",
        subscription_status: SubscriptionStatus.ACTIVE,
      })
    }

    await dunningModule.updateDunningAttempts({
      id: attempt.id,
      finished_at: finishedAt,
      status: DunningAttemptStatus.FAILED,
      error_code: outcome.error_code,
      error_message: outcome.error_message,
      payment_reference: outcome.payment_reference,
    } as any)

    const shouldCloseAsUnrecovered =
      outcome.kind === "permanent_failure" ||
      attemptNo >= dunningCase.max_attempts

    if (shouldCloseAsUnrecovered) {
      const updatedCase = await dunningModule.updateDunningCases({
        id: dunningCase.id,
        status: DunningCaseStatus.UNRECOVERED,
        next_retry_at: null,
        last_attempt_at: finishedAt,
        last_payment_error_code: outcome.error_code,
        last_payment_error_message: outcome.error_message,
        closed_at: finishedAt,
        recovery_reason:
          outcome.kind === "permanent_failure"
            ? "permanent_payment_failure"
            : "retry_limit_exhausted",
      } as any)

      return new StepResponse<RunDunningRetryStepOutput>({
        dunning_case_id: updatedCase.id,
        dunning_attempt_id: attempt.id,
        outcome: "unrecovered",
        subscription_status: subscription.status,
      })
    }

    const nextRetryAt = calculateNextRetryAt(
      dunningCase.retry_schedule!,
      attemptNo,
      finishedAt
    )

    if (!nextRetryAt) {
      const updatedCase = await dunningModule.updateDunningCases({
        id: dunningCase.id,
        status: DunningCaseStatus.UNRECOVERED,
        next_retry_at: null,
        last_attempt_at: finishedAt,
        last_payment_error_code: outcome.error_code,
        last_payment_error_message: outcome.error_message,
        closed_at: finishedAt,
        recovery_reason: "retry_schedule_exhausted",
      } as any)

      return new StepResponse<RunDunningRetryStepOutput>({
        dunning_case_id: updatedCase.id,
        dunning_attempt_id: attempt.id,
        outcome: "unrecovered",
        subscription_status: subscription.status,
      })
    }

    const updatedCase = await dunningModule.updateDunningCases({
      id: dunningCase.id,
      status: DunningCaseStatus.RETRY_SCHEDULED,
      next_retry_at: nextRetryAt,
      last_attempt_at: finishedAt,
      last_payment_error_code: outcome.error_code,
      last_payment_error_message: outcome.error_message,
      recovered_at: null,
      closed_at: null,
      recovery_reason: null,
    } as any)

    return new StepResponse<RunDunningRetryStepOutput>({
      dunning_case_id: updatedCase.id,
      dunning_attempt_id: attempt.id,
      outcome: "retry_scheduled",
      subscription_status: subscription.status,
    })
  }
)
