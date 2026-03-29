import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import { RenewalApprovalStatus } from "../../modules/renewal/types"
import {
  getRenewalCycleApprovalRecord,
  validateRenewalApprovalTransition,
} from "./shared-renewal-approval"

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
      container.resolve<RenewalModuleService>(RENEWAL_MODULE)
    const decidedAt = new Date()

    const updated = await renewalModule.updateRenewalCycles({
      id: cycle.id,
      approval_status: RenewalApprovalStatus.APPROVED,
      approval_decided_at: decidedAt,
      approval_decided_by: input.decided_by ?? null,
      approval_reason: input.reason ?? null,
    })

    return new StepResponse(updated, {
      id: cycle.id,
      approval_status: cycle.approval_status,
      approval_decided_at: cycle.approval_decided_at,
      approval_decided_by: cycle.approval_decided_by,
      approval_reason: cycle.approval_reason,
    })
  },
  async function (previous, { container }) {
    if (!previous) {
      return
    }

    const renewalModule =
      container.resolve<RenewalModuleService>(RENEWAL_MODULE)

    await renewalModule.updateRenewalCycles(previous)
  }
)

