import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import { RenewalApprovalStatus } from "../../modules/renewal/types"
import {
  getRenewalCycleApprovalRecord,
  validateRenewalApprovalTransition,
} from "./shared-renewal-approval"
import {
  RenewalApprovalStepResult,
} from "./approve-renewal-changes"

type RenewalApprovalCompensationInput = {
  id: string
  approval_status: RenewalApprovalStatus | null
  approval_decided_at: Date | null
  approval_decided_by: string | null
  approval_reason: string | null
}

export type RejectRenewalChangesStepInput = {
  renewal_cycle_id: string
  decided_by?: string | null
  reason?: string | null
}

export const rejectRenewalChangesStep = createStep(
  "reject-renewal-changes",
  async function (input: RejectRenewalChangesStepInput, { container }) {
    const cycle = await getRenewalCycleApprovalRecord(
      container,
      input.renewal_cycle_id
    )

    validateRenewalApprovalTransition(cycle, RenewalApprovalStatus.REJECTED)

    const renewalModule =
      container.resolve(RENEWAL_MODULE) as RenewalModuleService
    const subscriptionModule =
      container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService
    const decidedAt = new Date()
    const subscription = await subscriptionModule.retrieveSubscription(
      cycle.subscription_id
    )

    const updated = await renewalModule.updateRenewalCycles({
      id: cycle.id,
      approval_status: RenewalApprovalStatus.REJECTED,
      approval_decided_at: decidedAt,
      approval_decided_by: input.decided_by ?? null,
      approval_reason: input.reason ?? null,
    })

    return new StepResponse<
      RenewalApprovalStepResult,
      RenewalApprovalCompensationInput
    >(
      {
        current: updated as any,
        previous: {
          id: cycle.id,
          subscription_id: cycle.subscription_id,
          approval_status: cycle.approval_status,
          approval_decided_at: cycle.approval_decided_at,
          approval_decided_by: cycle.approval_decided_by,
          approval_reason: cycle.approval_reason,
        },
        subscription: subscription as any,
      },
      {
        id: cycle.id,
        approval_status: cycle.approval_status,
        approval_decided_at: cycle.approval_decided_at,
        approval_decided_by: cycle.approval_decided_by,
        approval_reason: cycle.approval_reason,
      }
    )
  },
  async function (previous: RenewalApprovalCompensationInput, { container }) {
    if (!previous) {
      return
    }

    const renewalModule =
      container.resolve(RENEWAL_MODULE) as RenewalModuleService

    await renewalModule.updateRenewalCycles(previous)
  }
)
