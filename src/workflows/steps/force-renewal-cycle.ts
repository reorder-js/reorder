import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../modules/renewal/types"
import { renewalErrors } from "../../modules/renewal/utils/errors"
import { processRenewalCycleWorkflow } from "../process-renewal-cycle"

export type ForceRenewalCycleStepInput = {
  renewal_cycle_id: string
  triggered_by?: string | null
  reason?: string | null
}

export const forceRenewalCycleStep = createStep(
  "force-renewal-cycle",
  async function (input: ForceRenewalCycleStepInput, { container }) {
    const renewalModule =
      container.resolve<RenewalModuleService>(RENEWAL_MODULE)

    let cycle: Awaited<ReturnType<RenewalModuleService["retrieveRenewalCycle"]>>

    try {
      cycle = await renewalModule.retrieveRenewalCycle(input.renewal_cycle_id)
    } catch {
      throw renewalErrors.notFound("RenewalCycle", input.renewal_cycle_id)
    }

    if (cycle.status === RenewalCycleStatus.PROCESSING) {
      throw renewalErrors.alreadyProcessing(cycle.id)
    }

    if (cycle.status === RenewalCycleStatus.SUCCEEDED) {
      throw renewalErrors.duplicateExecutionBlocked(cycle.id)
    }

    if (
      cycle.status !== RenewalCycleStatus.SCHEDULED &&
      cycle.status !== RenewalCycleStatus.FAILED
    ) {
      throw renewalErrors.invalidTransition(
        cycle.id,
        `Renewal '${cycle.id}' can only be force-run from 'scheduled' or 'failed' state`
      )
    }

    if (
      cycle.approval_required &&
      cycle.approval_status !== RenewalApprovalStatus.APPROVED
    ) {
      throw renewalErrors.invalidTransition(
        cycle.id,
        `Renewal '${cycle.id}' requires approved changes before it can be force-run`
      )
    }

    await processRenewalCycleWorkflow(container).run({
      input: {
        renewal_cycle_id: cycle.id,
        trigger_type: "manual",
        triggered_by: input.triggered_by ?? null,
        reason: input.reason ?? null,
      },
    })

    return new StepResponse(cycle.id)
  }
)
