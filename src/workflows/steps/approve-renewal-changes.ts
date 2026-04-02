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

type RenewalApprovalDisplayRecord = {
  reference: string
  customer_id: string
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
}

type RenewalApprovalWorkflowRecord = {
  id: string
  subscription_id: string
  approval_status: RenewalApprovalStatus | null
  approval_decided_at: Date | null
  approval_decided_by: string | null
  approval_reason: string | null
}

export type RenewalApprovalStepResult = {
  current: RenewalApprovalWorkflowRecord
  previous: RenewalApprovalWorkflowRecord
  subscription: RenewalApprovalDisplayRecord
}

type RenewalApprovalCompensationInput = {
  id: string
  approval_status: RenewalApprovalStatus | null
  approval_decided_at: Date | null
  approval_decided_by: string | null
  approval_reason: string | null
}

export type ApproveRenewalChangesStepInput = {
  renewal_cycle_id: string
  decided_by?: string | null
  reason?: string | null
}

export const approveRenewalChangesStep = createStep(
  "approve-renewal-changes",
  async function (input: ApproveRenewalChangesStepInput, { container }) {
    const cycle = await getRenewalCycleApprovalRecord(
      container,
      input.renewal_cycle_id
    )

    validateRenewalApprovalTransition(cycle, RenewalApprovalStatus.APPROVED)

    const renewalModule =
      container.resolve(RENEWAL_MODULE) as RenewalModuleService
    const subscriptionModule =
      container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService
    const decidedAt = new Date()
    const subscription = (await subscriptionModule.retrieveSubscription(
      cycle.subscription_id
    )) as unknown as RenewalApprovalDisplayRecord

    const updated = await renewalModule.updateRenewalCycles({
      id: cycle.id,
      approval_status: RenewalApprovalStatus.APPROVED,
      approval_decided_at: decidedAt,
      approval_decided_by: input.decided_by ?? null,
      approval_reason: input.reason ?? null,
    })

    return new StepResponse<
      RenewalApprovalStepResult,
      RenewalApprovalCompensationInput
    >(
      {
        current: updated as unknown as RenewalApprovalWorkflowRecord,
        previous: {
          id: cycle.id,
          subscription_id: cycle.subscription_id,
          approval_status: cycle.approval_status,
          approval_decided_at: cycle.approval_decided_at,
          approval_decided_by: cycle.approval_decided_by,
          approval_reason: cycle.approval_reason,
        },
        subscription,
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
