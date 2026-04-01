import {
  CancellationRecommendedAction,
  type CancellationReasonCategory,
} from "../types"
import { SubscriptionStatus } from "../../subscription/types"
import { DunningCaseStatus } from "../../dunning/types"

const ACTIVE_DUNNING_CASE_STATUSES = new Set<DunningCaseStatus>([
  DunningCaseStatus.OPEN,
  DunningCaseStatus.RETRY_SCHEDULED,
  DunningCaseStatus.RETRYING,
  DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
])

type SmartCancellationPolicyInput = {
  subscription_status: SubscriptionStatus
  reason_category: CancellationReasonCategory | null
  has_active_dunning: boolean
}

export type SmartCancellationRecommendation = {
  recommended_action: CancellationRecommendedAction
  eligible_actions: CancellationRecommendedAction[]
  rationale: string
}

export function isActiveDunningCase(status: DunningCaseStatus) {
  return ACTIVE_DUNNING_CASE_STATUSES.has(status)
}

export function getEligibleCancellationActions(
  input: SmartCancellationPolicyInput
) {
  if (input.subscription_status === SubscriptionStatus.PAUSED) {
    return [CancellationRecommendedAction.DIRECT_CANCEL]
  }

  if (
    input.subscription_status === SubscriptionStatus.PAST_DUE ||
    input.has_active_dunning
  ) {
    return [
      CancellationRecommendedAction.PAUSE_OFFER,
      CancellationRecommendedAction.DIRECT_CANCEL,
    ]
  }

  return [
    CancellationRecommendedAction.PAUSE_OFFER,
    CancellationRecommendedAction.DISCOUNT_OFFER,
    CancellationRecommendedAction.DIRECT_CANCEL,
  ]
}

export function getSmartCancellationRecommendation(
  input: SmartCancellationPolicyInput
): SmartCancellationRecommendation {
  const eligible_actions = getEligibleCancellationActions(input)

  if (input.subscription_status === SubscriptionStatus.PAUSED) {
    return {
      recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
      eligible_actions,
      rationale:
        "Subscription is already paused, so pause is no longer a meaningful save action",
    }
  }

  if (input.reason_category === "temporary_pause") {
    return {
      recommended_action: CancellationRecommendedAction.PAUSE_OFFER,
      eligible_actions,
      rationale:
        "Temporary-pause churn reason is the strongest signal for offering pause before cancellation",
    }
  }

  if (input.reason_category === "price") {
    if (eligible_actions.includes(CancellationRecommendedAction.DISCOUNT_OFFER)) {
      return {
        recommended_action: CancellationRecommendedAction.DISCOUNT_OFFER,
        eligible_actions,
        rationale:
          "Price-driven churn is the strongest signal for offering a time-limited discount before cancellation",
      }
    }

    return {
      recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
      eligible_actions,
      rationale:
        "Price-driven churn would normally suggest a discount, but pricing concessions are not recommended while the subscription is past due or under active dunning",
    }
  }

  if (input.reason_category === "billing") {
    return {
      recommended_action: eligible_actions.includes(
        CancellationRecommendedAction.PAUSE_OFFER
      )
        ? CancellationRecommendedAction.PAUSE_OFFER
        : CancellationRecommendedAction.DIRECT_CANCEL,
      eligible_actions,
      rationale:
        "Billing-driven churn is better handled with pause than a commercial concession, especially when future renewals may need to be stopped temporarily",
    }
  }

  return {
    recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
    eligible_actions,
    rationale:
      "No stronger retention signal was detected for this churn reason, so direct cancellation is the safest default recommendation",
  }
}
