import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CANCELLATION_MODULE } from "../../modules/cancellation"
import type CancellationModuleService from "../../modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationRecommendedAction,
  type CancellationReasonCategory,
} from "../../modules/cancellation/types"
import { appendCancellationManualAction } from "../../modules/cancellation/utils/audit"
import { cancellationErrors } from "../../modules/cancellation/utils/errors"
import {
  getSmartCancellationRecommendation,
  isActiveDunningCase,
  type SmartCancellationRecommendation,
} from "../../modules/cancellation/utils/smart-cancellation"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import { DunningCaseStatus } from "../../modules/dunning/types"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"

const ACTIVE_CANCELLATION_CASE_STATUSES = new Set<CancellationCaseStatus>([
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
  recommended_action: CancellationRecommendedAction | null
  final_outcome: string | null
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
}

type DunningCaseRecord = {
  id: string
  status: DunningCaseStatus
}

export type SmartCancellationStepInput = {
  cancellation_case_id: string
  evaluated_by?: string | null
  metadata?: Record<string, unknown> | null
}

type SmartCancellationStepOutput = {
  cancellation_case_id: string
  subscription_id: string
  status: CancellationCaseStatus
  recommended_action: CancellationRecommendedAction
  eligible_actions: CancellationRecommendedAction[]
  rationale: string
  has_active_dunning: boolean
}

type SmartCancellationCompensation = {
  previous_case: CancellationCaseRecord
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

function validateSmartCancellationState(cancellationCase: CancellationCaseRecord) {
  if (!ACTIVE_CANCELLATION_CASE_STATUSES.has(cancellationCase.status)) {
    throw cancellationErrors.invalidCaseState(
      cancellationCase.id,
      "run smart cancellation",
      cancellationCase.status
    )
  }
}

function createRecommendationMetadata(
  previousMetadata: Record<string, unknown> | null,
  recommendation: SmartCancellationRecommendation,
  input: SmartCancellationStepInput
) {
  const evaluatedAt = new Date().toISOString()
  const base = {
    ...(previousMetadata ?? {}),
    ...(input.metadata ?? {}),
    smart_cancellation: {
      recommended_action: recommendation.recommended_action,
      eligible_actions: recommendation.eligible_actions,
      rationale: recommendation.rationale,
      evaluated_by: input.evaluated_by ?? null,
      evaluated_at: evaluatedAt,
    },
  }

  return appendCancellationManualAction(base, {
    action: "smart_cancel",
    who: input.evaluated_by ?? null,
    when: evaluatedAt,
    why: recommendation.rationale,
    data: {
      recommended_action: recommendation.recommended_action,
      eligible_actions: recommendation.eligible_actions,
    },
  })
}

export const smartCancellationStep = createStep(
  "smart-cancellation",
  async function (
    input: SmartCancellationStepInput,
    { container }
  ) {
    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    const cancellationCase = await loadCancellationCase(
      container,
      input.cancellation_case_id
    )

    validateSmartCancellationState(cancellationCase)

    const subscription = await loadSubscription(
      container,
      cancellationCase.subscription_id
    )
    const activeDunningCase = await loadActiveDunningCase(
      container,
      cancellationCase.subscription_id
    )

    const recommendation = getSmartCancellationRecommendation({
      subscription_status: subscription.status,
      reason_category: cancellationCase.reason_category,
      has_active_dunning: Boolean(activeDunningCase),
    })

    const updated = (await cancellationModule.updateCancellationCases({
      id: cancellationCase.id,
      status: CancellationCaseStatus.EVALUATING_RETENTION,
      recommended_action: recommendation.recommended_action,
      metadata: createRecommendationMetadata(
        cancellationCase.metadata,
        recommendation,
        input
      ),
    } as any)) as CancellationCaseRecord

    return new StepResponse<
      SmartCancellationStepOutput,
      SmartCancellationCompensation
    >(
      {
        cancellation_case_id: updated.id,
        subscription_id: updated.subscription_id,
        status: updated.status,
        recommended_action: recommendation.recommended_action,
        eligible_actions: recommendation.eligible_actions,
        rationale: recommendation.rationale,
        has_active_dunning: Boolean(activeDunningCase),
      },
      {
        previous_case: cancellationCase,
      }
    )
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    await cancellationModule.updateCancellationCases(compensation.previous_case as any)
  }
)
