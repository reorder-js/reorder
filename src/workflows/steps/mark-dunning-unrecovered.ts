import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import { DunningCaseStatus } from "../../modules/dunning/types"
import { dunningErrors } from "../../modules/dunning/utils/errors"

type DunningCaseRecord = {
  id: string
  status: DunningCaseStatus
  next_retry_at: Date | null
  closed_at: Date | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
}

export type MarkDunningUnrecoveredStepInput = {
  dunning_case_id: string
  triggered_by?: string | null
  reason: string
}

function appendAuditMetadata(
  metadata: Record<string, unknown> | null,
  input: MarkDunningUnrecoveredStepInput,
  at: string
) {
  const existing = Array.isArray(metadata?.manual_actions)
    ? [...(metadata?.manual_actions as Record<string, unknown>[])]
    : []

  existing.push({
    action: "mark_unrecovered",
    who: input.triggered_by ?? null,
    when: at,
    reason: input.reason,
  })

  return {
    ...(metadata ?? {}),
    manual_actions: existing,
    last_manual_action: existing[existing.length - 1],
  }
}

export const markDunningUnrecoveredStep = createStep(
  "mark-dunning-unrecovered",
  async function (
    input: MarkDunningUnrecoveredStepInput,
    { container }
  ) {
    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)

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
        "be marked unrecovered"
      )
    }

    const changedAt = new Date()

    const updated = await dunningModule.updateDunningCases({
      id: dunningCase.id,
      status: DunningCaseStatus.UNRECOVERED,
      next_retry_at: null,
      closed_at: changedAt,
      recovery_reason: "marked_unrecovered_by_admin",
      metadata: appendAuditMetadata(
        dunningCase.metadata,
        input,
        changedAt.toISOString()
      ),
    } as any)

    return new StepResponse(updated, dunningCase)
  },
  async function (previousCase: DunningCaseRecord, { container }) {
    if (!previousCase) {
      return
    }

    const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)

    await dunningModule.updateDunningCases(previousCase as any)
  }
)
