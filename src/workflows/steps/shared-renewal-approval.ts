import { MedusaContainer } from "@medusajs/framework/types"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../modules/renewal/types"
import { renewalErrors } from "../../modules/renewal/utils/errors"

export type RenewalCycleApprovalRecord = {
  id: string
  status: RenewalCycleStatus
  approval_required: boolean
  approval_status: RenewalApprovalStatus | null
  approval_decided_at: Date | null
  approval_decided_by: string | null
  approval_reason: string | null
}

export async function getRenewalCycleApprovalRecord(
  container: MedusaContainer,
  id: string
): Promise<RenewalCycleApprovalRecord> {
  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

  try {
    return (await renewalModule.retrieveRenewalCycle(
      id
    )) as unknown as RenewalCycleApprovalRecord
  } catch {
    throw renewalErrors.notFound("RenewalCycle", id)
  }
}

export function validateRenewalApprovalTransition(
  cycle: RenewalCycleApprovalRecord,
  targetStatus: RenewalApprovalStatus
) {
  if (!cycle.approval_required) {
    throw renewalErrors.approvalNotRequired(cycle.id)
  }

  if (cycle.status === RenewalCycleStatus.PROCESSING) {
    throw renewalErrors.invalidTransition(
      cycle.id,
      `Renewal '${cycle.id}' can't change approval state while processing`
    )
  }

  if (cycle.status === RenewalCycleStatus.SUCCEEDED) {
    throw renewalErrors.invalidTransition(
      cycle.id,
      `Renewal '${cycle.id}' can't change approval state after success`
    )
  }

  if (cycle.approval_status !== RenewalApprovalStatus.PENDING) {
    throw renewalErrors.approvalAlreadyDecided(cycle.id)
  }

  if (targetStatus !== RenewalApprovalStatus.APPROVED && targetStatus !== RenewalApprovalStatus.REJECTED) {
    throw renewalErrors.invalidData(
      `Unsupported approval transition '${targetStatus}'`
    )
  }
}
