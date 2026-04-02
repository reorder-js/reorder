import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CANCELLATION_MODULE } from "../../modules/cancellation"
import type CancellationModuleService from "../../modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationRecommendedAction,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
  type CancellationReasonCategory,
  type RetentionOfferPayload,
} from "../../modules/cancellation/types"
import { appendCancellationManualAction } from "../../modules/cancellation/utils/audit"
import { cancellationErrors } from "../../modules/cancellation/utils/errors"
import {
  getEligibleCancellationActions,
  isActiveDunningCase,
} from "../../modules/cancellation/utils/smart-cancellation"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import { DunningCaseStatus } from "../../modules/dunning/types"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { CancellationSubscriptionDisplayRecord } from "./shared-cancellation-log"

const APPLIABLE_CANCELLATION_CASE_STATUSES = new Set<CancellationCaseStatus>([
  CancellationCaseStatus.EVALUATING_RETENTION,
  CancellationCaseStatus.RETENTION_OFFERED,
  CancellationCaseStatus.REQUESTED,
])

type CancellationCaseRecord = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: CancellationReasonCategory | null
  notes: string | null
  recommended_action: CancellationRecommendedAction | null
  final_outcome: CancellationFinalOutcome | null
  finalized_at: Date | null
  finalized_by: string | null
  cancellation_effective_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

type RetentionOfferEventRecord = {
  id: string
}

type SubscriptionRecord = {
  id: string
  reference: string
  customer_id: string
  status: SubscriptionStatus
  paused_at: Date | null
  cancel_effective_at: Date | null
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
  metadata: Record<string, unknown> | null
}

type DunningCaseRecord = {
  id: string
  status: DunningCaseStatus
}

export type ApplyRetentionOfferStepInput = {
  cancellation_case_id: string
  offer_type: RetentionOfferType
  offer_payload: RetentionOfferPayload
  decided_by?: string | null
  decision_reason?: string | null
  metadata?: Record<string, unknown> | null
}

type ApplyRetentionOfferStepOutput = {
  current: CancellationCaseRecord
  previous: CancellationCaseRecord
  subscription: CancellationSubscriptionDisplayRecord
  cancellation_case_id: string
  retention_offer_event_id: string
  subscription_id: string
  offer_type: RetentionOfferType
  final_case_status: CancellationCaseStatus
  final_outcome: CancellationFinalOutcome
}

type ApplyRetentionOfferCompensation = {
  previous_case: CancellationCaseRecord
  previous_subscription: SubscriptionRecord
  created_event_id: string
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

async function loadActiveDunningCase(
  container: { resolve(key: string): unknown },
  subscriptionId: string
) {
  const dunningModule = container.resolve(DUNNING_MODULE) as DunningModuleService
  const dunningCases = (await dunningModule.listDunningCases({
    subscription_id: subscriptionId,
  } as any)) as DunningCaseRecord[]

  return dunningCases.find((dunningCase) => isActiveDunningCase(dunningCase.status))
}

function validateCaseState(cancellationCase: CancellationCaseRecord) {
  if (cancellationCase.finalized_at) {
    throw cancellationErrors.alreadyFinalized(
      cancellationCase.id,
      cancellationCase.status
    )
  }

  if (!APPLIABLE_CANCELLATION_CASE_STATUSES.has(cancellationCase.status)) {
    throw cancellationErrors.invalidCaseState(
      cancellationCase.id,
      "apply retention offer",
      cancellationCase.status
    )
  }
}

function validateOfferPayload(
  offerType: RetentionOfferType,
  offerPayload: RetentionOfferPayload
) {
  if (offerType === RetentionOfferType.PAUSE_OFFER) {
    if (!("pause_offer" in offerPayload)) {
      throw cancellationErrors.invalidData(
        "Pause offer payload must include 'pause_offer'"
      )
    }

    return
  }

  if (offerType === RetentionOfferType.DISCOUNT_OFFER) {
    if (!("discount_offer" in offerPayload)) {
      throw cancellationErrors.invalidData(
        "Discount offer payload must include 'discount_offer'"
      )
    }

    return
  }

  if (offerType === RetentionOfferType.BONUS_OFFER) {
    if (!("bonus_offer" in offerPayload)) {
      throw cancellationErrors.invalidData(
        "Bonus offer payload must include 'bonus_offer'"
      )
    }

    return
  }

  throw cancellationErrors.invalidData(`Unsupported retention offer '${offerType}'`)
}

function validateOfferPolicy(params: {
  cancellationCase: CancellationCaseRecord
  subscription: SubscriptionRecord
  activeDunningCase: DunningCaseRecord | undefined
  offerType: RetentionOfferType
}) {
  const eligibleActions = getEligibleCancellationActions({
    subscription_status: params.subscription.status,
    reason_category: params.cancellationCase.reason_category,
    has_active_dunning: Boolean(params.activeDunningCase),
  })

  const requiredActionByOfferType: Record<
    RetentionOfferType,
    CancellationRecommendedAction
  > = {
    [RetentionOfferType.PAUSE_OFFER]: CancellationRecommendedAction.PAUSE_OFFER,
    [RetentionOfferType.DISCOUNT_OFFER]:
      CancellationRecommendedAction.DISCOUNT_OFFER,
    [RetentionOfferType.BONUS_OFFER]: CancellationRecommendedAction.BONUS_OFFER,
  }

  const requiredAction = requiredActionByOfferType[params.offerType]

  if (!eligibleActions.includes(requiredAction)) {
    throw cancellationErrors.offerOutOfPolicy(
      params.cancellationCase.id,
      params.offerType
    )
  }
}

function buildAppliedRetentionMetadata(
  subscription: SubscriptionRecord,
  input: ApplyRetentionOfferStepInput,
  appliedAt: Date
) {
  const base = {
    ...(subscription.metadata ?? {}),
    applied_retention_offer: {
      offer_type: input.offer_type,
      offer_payload: input.offer_payload,
      decided_by: input.decided_by ?? null,
      decision_reason: input.decision_reason ?? null,
      applied_at: appliedAt.toISOString(),
    },
  }

  return appendCancellationManualAction(base, {
    action: "apply_offer",
    who: input.decided_by ?? null,
    when: appliedAt.toISOString(),
    why: input.decision_reason ?? null,
    data: {
      offer_type: input.offer_type,
    },
  })
}

export const applyRetentionOfferStep = createStep(
  "apply-retention-offer",
  async function (
    input: ApplyRetentionOfferStepInput,
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
    validateOfferPayload(input.offer_type, input.offer_payload)

    const subscription = await loadSubscription(
      container,
      cancellationCase.subscription_id
    )
    const activeDunningCase = await loadActiveDunningCase(
      container,
      cancellationCase.subscription_id
    )

    validateOfferPolicy({
      cancellationCase,
      subscription,
      activeDunningCase,
      offerType: input.offer_type,
    })

    const appliedAt = new Date()
    const finalCaseStatus =
      input.offer_type === RetentionOfferType.PAUSE_OFFER
        ? CancellationCaseStatus.PAUSED
        : CancellationCaseStatus.RETAINED
    const finalOutcome =
      input.offer_type === RetentionOfferType.PAUSE_OFFER
        ? CancellationFinalOutcome.PAUSED
        : CancellationFinalOutcome.RETAINED

    const createdEvent = (await cancellationModule.createRetentionOfferEvents({
      cancellation_case_id: cancellationCase.id,
      offer_type: input.offer_type,
      offer_payload: input.offer_payload,
      decision_status: RetentionOfferDecisionStatus.APPLIED,
      decision_reason: input.decision_reason ?? null,
      decided_at: appliedAt,
      decided_by: input.decided_by ?? null,
      applied_at: appliedAt,
      metadata: {
        ...(input.metadata ?? {}),
        source: "apply_retention_offer_workflow",
      },
    } as any)) as RetentionOfferEventRecord

    if (input.offer_type === RetentionOfferType.PAUSE_OFFER) {
      await subscriptionModule.updateSubscriptions({
        id: subscription.id,
        status: SubscriptionStatus.PAUSED,
        paused_at: appliedAt,
        cancel_effective_at: null,
        metadata: buildAppliedRetentionMetadata(subscription, input, appliedAt),
      })
    } else {
      await subscriptionModule.updateSubscriptions({
        id: subscription.id,
        metadata: buildAppliedRetentionMetadata(subscription, input, appliedAt),
      })
    }

    await cancellationModule.updateCancellationCases({
      id: cancellationCase.id,
      status: finalCaseStatus,
      final_outcome: finalOutcome,
      finalized_at: appliedAt,
      finalized_by: input.decided_by ?? null,
      metadata: appendCancellationManualAction(
        {
        ...(cancellationCase.metadata ?? {}),
        ...(input.metadata ?? {}),
        applied_retention_offer: {
          event_id: createdEvent.id,
          offer_type: input.offer_type,
          final_outcome: finalOutcome,
          applied_at: appliedAt.toISOString(),
        },
      },
        {
          action: "apply_offer",
          who: input.decided_by ?? null,
          when: appliedAt.toISOString(),
          why: input.decision_reason ?? null,
          data: {
            event_id: createdEvent.id,
            offer_type: input.offer_type,
            final_outcome: finalOutcome,
          },
        }
      ),
    } as any)

    const updatedCase = (await cancellationModule.retrieveCancellationCase(
      cancellationCase.id
    )) as CancellationCaseRecord

    return new StepResponse<
      ApplyRetentionOfferStepOutput,
      ApplyRetentionOfferCompensation
    >(
      {
        current: updatedCase,
        previous: cancellationCase,
        subscription: subscription as CancellationSubscriptionDisplayRecord,
        cancellation_case_id: cancellationCase.id,
        retention_offer_event_id: createdEvent.id,
        subscription_id: subscription.id,
        offer_type: input.offer_type,
        final_case_status: finalCaseStatus,
        final_outcome: finalOutcome,
      },
      {
        previous_case: cancellationCase,
        previous_subscription: subscription,
        created_event_id: createdEvent.id,
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

    await cancellationModule.deleteRetentionOfferEvents(compensation.created_event_id)
    await cancellationModule.updateCancellationCases(compensation.previous_case as any)
    await subscriptionModule.updateSubscriptions(compensation.previous_subscription as any)
  }
)
