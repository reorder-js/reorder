import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import { DunningCaseStatus } from "../../modules/dunning/types"
import { dunningErrors } from "../../modules/dunning/utils/errors"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"

type SubscriptionRecord = {
  id: string
  status: SubscriptionStatus
}

type DunningCaseRecord = {
  id: string
  subscription_id: string
  status: DunningCaseStatus
  next_retry_at: Date | null
  recovered_at: Date | null
  closed_at: Date | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
}

export type MarkDunningRecoveredStepInput = {
  dunning_case_id: string
  triggered_by?: string | null
  reason?: string | null
}

type Compensation = {
  previous_case: DunningCaseRecord
  previous_subscription: SubscriptionRecord | null
}

function appendAuditMetadata(
  metadata: Record<string, unknown> | null,
  action: string,
  input: MarkDunningRecoveredStepInput,
  at: string
) {
  const existing = Array.isArray(metadata?.manual_actions)
    ? [...(metadata?.manual_actions as Record<string, unknown>[])]
    : []

  existing.push({
    action,
    who: input.triggered_by ?? null,
    when: at,
    reason: input.reason ?? null,
  })

  return {
    ...(metadata ?? {}),
    manual_actions: existing,
    last_manual_action: existing[existing.length - 1],
  }
}

export const markDunningRecoveredStep = createStep(
  "mark-dunning-recovered",
  async function (
    input: MarkDunningRecoveredStepInput,
    { container }
  ) {
    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    const dunningCase = (await dunningModule.retrieveDunningCase(
      input.dunning_case_id
    )) as DunningCaseRecord

    if (dunningCase.status === DunningCaseStatus.RECOVERED) {
      throw dunningErrors.alreadyRecovered(dunningCase.id)
    }

    if (dunningCase.status === DunningCaseStatus.UNRECOVERED) {
      throw dunningErrors.alreadyUnrecovered(dunningCase.id)
    }

    if (dunningCase.status === DunningCaseStatus.RETRYING) {
      throw dunningErrors.retryInFlightTransitionBlocked(
        dunningCase.id,
        "be marked recovered"
      )
    }

    const subscription = (await subscriptionModule.retrieveSubscription(
      dunningCase.subscription_id
    )) as SubscriptionRecord
    const changedAt = new Date()

    const updatedCase = await dunningModule.updateDunningCases({
      id: dunningCase.id,
      status: DunningCaseStatus.RECOVERED,
      next_retry_at: null,
      recovered_at: changedAt,
      closed_at: changedAt,
      recovery_reason: "marked_recovered_by_admin",
      metadata: appendAuditMetadata(
        dunningCase.metadata,
        "mark_recovered",
        input,
        changedAt.toISOString()
      ),
    } as any)

    const previousSubscription =
      subscription.status === SubscriptionStatus.PAST_DUE ? subscription : null

    if (previousSubscription) {
      await subscriptionModule.updateSubscriptions({
        id: subscription.id,
        status: SubscriptionStatus.ACTIVE,
      })
    }

    return new StepResponse(updatedCase, {
      previous_case: dunningCase,
      previous_subscription: previousSubscription,
    } satisfies Compensation)
  },
  async function (compensation: Compensation, { container }) {
    if (!compensation) {
      return
    }

    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    await dunningModule.updateDunningCases(compensation.previous_case as any)

    if (compensation.previous_subscription) {
      await subscriptionModule.updateSubscriptions(
        compensation.previous_subscription as any
      )
    }
  }
)
