import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../types"
import { SubscriptionRenewalBehavior } from "../../settings/types"
import { SubscriptionPendingUpdateData, SubscriptionStatus } from "../../subscription/types"

export type UpcomingRenewalSubscriptionRecord = {
  id: string
  status: SubscriptionStatus
  next_renewal_at: Date | null
  cancelled_at: Date | null
  cancel_effective_at: Date | null
  pending_update_data: SubscriptionPendingUpdateData | null
}

export type UpcomingRenewalCycleRecord = {
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
  applied_pending_update_data: Record<string, unknown> | null
  last_error: string | null
  attempt_count: number
  metadata: Record<string, unknown> | null
}

export function shouldSubscriptionHaveUpcomingRenewalCycle(
  subscription: UpcomingRenewalSubscriptionRecord
) {
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    return false
  }

  if (!subscription.next_renewal_at) {
    return false
  }

  if (subscription.cancelled_at) {
    return false
  }

  if (
    subscription.cancel_effective_at &&
    subscription.cancel_effective_at <= subscription.next_renewal_at
  ) {
    return false
  }

  return true
}

export function deriveUpcomingRenewalApprovalState(
  subscription: UpcomingRenewalSubscriptionRecord,
  scheduledFor: Date,
  behavior = SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES
) {
  const pendingUpdateApplicable = isPendingUpdateApplicable(
    scheduledFor,
    subscription.pending_update_data
  )
  const requiresApproval =
    behavior ===
      SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES &&
    pendingUpdateApplicable

  return {
    approval_required: requiresApproval,
    approval_status: requiresApproval ? RenewalApprovalStatus.PENDING : null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
  }
}

export function findUpcomingRenewalCycle(
  cycles: UpcomingRenewalCycleRecord[],
  scheduledFor: Date
) {
  return cycles.find((cycle) => {
    return cycle.scheduled_for.getTime() === scheduledFor.getTime()
  })
}

export function isPendingUpdateApplicable(
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
