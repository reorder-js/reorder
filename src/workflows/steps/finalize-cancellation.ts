import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CANCELLATION_MODULE } from "../../modules/cancellation"
import type CancellationModuleService from "../../modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  type CancellationReasonCategory,
} from "../../modules/cancellation/types"
import { cancellationErrors } from "../../modules/cancellation/utils/errors"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

const FINALIZABLE_CANCELLATION_CASE_STATUSES = new Set<CancellationCaseStatus>([
  CancellationCaseStatus.REQUESTED,
  CancellationCaseStatus.EVALUATING_RETENTION,
  CancellationCaseStatus.RETENTION_OFFERED,
])

type CancellationCaseRecord = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: CancellationReasonCategory | null
  notes: string | null
  recommended_action: string | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: Date | null
  finalized_by: string | null
  cancellation_effective_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

type SubscriptionRecord = {
  id: string
  status: SubscriptionStatus
  next_renewal_at: Date | null
  cancelled_at: Date | null
  cancel_effective_at: Date | null
  metadata: Record<string, unknown> | null
}

export type FinalizeCancellationStepInput = {
  cancellation_case_id: string
  reason?: string | null
  reason_category?: CancellationReasonCategory | null
  notes?: string | null
  finalized_by?: string | null
  effective_at?: "immediately" | "end_of_cycle"
  metadata?: Record<string, unknown> | null
}

type FinalizeCancellationStepOutput = {
  cancellation_case_id: string
  subscription_id: string
  case_status: CancellationCaseStatus
  final_outcome: CancellationFinalOutcome
  cancel_effective_at: Date
}

type FinalizeCancellationCompensation = {
  previous_case: CancellationCaseRecord
  previous_subscription: SubscriptionRecord
}

async function loadCancellationCase(
  container: { resolve(key: string): unknown },
  id: string
) {
  const cancellationModule =
    container.resolve(CANCELLATION_MODULE) as CancellationModuleService

  try {
    return (await cancellationModule.retrieveCancellationCase(
      id
    )) as CancellationCaseRecord
  } catch {
    throw cancellationErrors.notFound("CancellationCase", id)
  }
}

async function loadSubscription(
  container: { resolve(key: string): unknown },
  id: string
) {
  const subscriptionModule =
    container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService

  return (await subscriptionModule.retrieveSubscription(id)) as SubscriptionRecord
}

function validateCaseState(cancellationCase: CancellationCaseRecord) {
  if (!FINALIZABLE_CANCELLATION_CASE_STATUSES.has(cancellationCase.status)) {
    throw cancellationErrors.invalidCaseState(
      cancellationCase.id,
      "finalize cancellation",
      cancellationCase.status
    )
  }
}

function validateSubscriptionState(subscription: SubscriptionRecord) {
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAUSED &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw subscriptionErrors.invalidState(
      subscription.id,
      "be cancelled",
      subscription.status
    )
  }
}

function resolveCancellationReason(
  cancellationCase: CancellationCaseRecord,
  input: FinalizeCancellationStepInput
) {
  return input.reason?.trim() || cancellationCase.reason?.trim() || null
}

function resolveCancellationReasonCategory(
  cancellationCase: CancellationCaseRecord,
  input: FinalizeCancellationStepInput
) {
  return input.reason_category ?? cancellationCase.reason_category ?? null
}

function resolveCancelEffectiveAt(
  subscription: SubscriptionRecord,
  effectiveAt: "immediately" | "end_of_cycle" | undefined,
  cancelledAt: Date
) {
  if (effectiveAt === "end_of_cycle" && subscription.next_renewal_at) {
    return subscription.next_renewal_at
  }

  return cancelledAt
}

function buildSubscriptionCancellationMetadata(
  subscription: SubscriptionRecord,
  input: FinalizeCancellationStepInput,
  reason: string,
  cancelEffectiveAt: Date,
  cancelledAt: Date
) {
  return {
    ...(subscription.metadata ?? {}),
    cancel_context: {
      reason,
      effective_at: input.effective_at ?? "immediately",
      cancel_effective_at: cancelEffectiveAt.toISOString(),
      cancelled_at: cancelledAt.toISOString(),
      finalized_by: input.finalized_by ?? null,
    },
  }
}

function buildCaseFinalizeMetadata(
  cancellationCase: CancellationCaseRecord,
  input: FinalizeCancellationStepInput,
  reason: string,
  reasonCategory: CancellationReasonCategory | null,
  cancelEffectiveAt: Date,
  finalizedAt: Date
) {
  return {
    ...(cancellationCase.metadata ?? {}),
    ...(input.metadata ?? {}),
    final_cancellation: {
      reason,
      reason_category: reasonCategory,
      effective_at: input.effective_at ?? "immediately",
      cancel_effective_at: cancelEffectiveAt.toISOString(),
      finalized_by: input.finalized_by ?? null,
      finalized_at: finalizedAt.toISOString(),
    },
  }
}

export const finalizeCancellationStep = createStep(
  "finalize-cancellation",
  async function (
    input: FinalizeCancellationStepInput,
    { container }
  ) {
    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    const cancellationCase = await loadCancellationCase(
      container,
      input.cancellation_case_id
    )
    validateCaseState(cancellationCase)

    const subscription = await loadSubscription(
      container,
      cancellationCase.subscription_id
    )
    validateSubscriptionState(subscription)

    const reason = resolveCancellationReason(cancellationCase, input)

    if (!reason) {
      throw cancellationErrors.missingCancellationReason(cancellationCase.id)
    }

    const reasonCategory = resolveCancellationReasonCategory(
      cancellationCase,
      input
    )
    const finalizedAt = new Date()
    const cancelEffectiveAt = resolveCancelEffectiveAt(
      subscription,
      input.effective_at,
      finalizedAt
    )

    await subscriptionModule.updateSubscriptions({
      id: subscription.id,
      status: SubscriptionStatus.CANCELLED,
      cancelled_at: finalizedAt,
      cancel_effective_at: cancelEffectiveAt,
      next_renewal_at: null,
      metadata: buildSubscriptionCancellationMetadata(
        subscription,
        input,
        reason,
        cancelEffectiveAt,
        finalizedAt
      ),
    })

    await cancellationModule.updateCancellationCases({
      id: cancellationCase.id,
      status: CancellationCaseStatus.CANCELED,
      reason,
      reason_category: reasonCategory,
      notes: input.notes ?? cancellationCase.notes ?? null,
      final_outcome: CancellationFinalOutcome.CANCELED,
      finalized_at: finalizedAt,
      finalized_by: input.finalized_by ?? null,
      cancellation_effective_at: cancelEffectiveAt,
      metadata: buildCaseFinalizeMetadata(
        cancellationCase,
        input,
        reason,
        reasonCategory,
        cancelEffectiveAt,
        finalizedAt
      ),
    } as any)

    return new StepResponse<
      FinalizeCancellationStepOutput,
      FinalizeCancellationCompensation
    >(
      {
        cancellation_case_id: cancellationCase.id,
        subscription_id: subscription.id,
        case_status: CancellationCaseStatus.CANCELED,
        final_outcome: CancellationFinalOutcome.CANCELED,
        cancel_effective_at: cancelEffectiveAt,
      },
      {
        previous_case: cancellationCase,
        previous_subscription: subscription,
      }
    )
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    await cancellationModule.updateCancellationCases(compensation.previous_case as any)
    await subscriptionModule.updateSubscriptions(
      compensation.previous_subscription as any
    )
  }
)
