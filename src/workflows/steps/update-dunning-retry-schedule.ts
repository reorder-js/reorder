import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { DUNNING_MODULE } from "../../modules/dunning"
import type DunningModuleService from "../../modules/dunning/service"
import {
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../../modules/dunning/types"
import { dunningErrors } from "../../modules/dunning/utils/errors"
import {
  calculateNextRetryAt,
  validateDunningRetrySchedule,
} from "../../modules/dunning/utils/retry-schedule"

type DunningCaseRecord = {
  id: string
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: Date | null
  metadata: Record<string, unknown> | null
}

export type UpdateDunningRetryScheduleStepInput = {
  dunning_case_id: string
  intervals: number[]
  max_attempts: number
  triggered_by?: string | null
  reason?: string | null
}

function appendAuditMetadata(
  metadata: Record<string, unknown> | null,
  input: UpdateDunningRetryScheduleStepInput,
  at: string
) {
  const existing = Array.isArray(metadata?.manual_actions)
    ? [...(metadata?.manual_actions as Record<string, unknown>[])]
    : []

  existing.push({
    action: "update_retry_schedule",
    who: input.triggered_by ?? null,
    when: at,
    reason: input.reason ?? null,
    schedule: {
      intervals: input.intervals,
      max_attempts: input.max_attempts,
    },
  })

  return {
    ...(metadata ?? {}),
    manual_actions: existing,
    last_manual_action: existing[existing.length - 1],
  }
}

export const updateDunningRetryScheduleStep = createStep(
  "update-dunning-retry-schedule",
  async function (
    input: UpdateDunningRetryScheduleStepInput,
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
        "update retry schedule"
      )
    }

    const retrySchedule: DunningRetrySchedule = {
      strategy: "fixed_intervals",
      intervals: [...input.intervals],
      timezone: "UTC",
      source: "manual_override",
    }

    try {
      validateDunningRetrySchedule(retrySchedule, input.max_attempts)
    } catch (error) {
      throw dunningErrors.invalidData(
        error instanceof Error ? error.message : "Invalid retry schedule"
      )
    }

    if (input.max_attempts < dunningCase.attempt_count) {
      throw dunningErrors.conflict(
        `DunningCase '${dunningCase.id}' already has ${dunningCase.attempt_count} attempts, which exceeds the requested max_attempts`
      )
    }

    const changedAt = new Date()

    let nextRetryAt = dunningCase.next_retry_at
    let nextStatus = dunningCase.status

    if (dunningCase.status === DunningCaseStatus.OPEN) {
      nextRetryAt = calculateNextRetryAt(retrySchedule, 0, changedAt)
      nextStatus = DunningCaseStatus.RETRY_SCHEDULED
    } else if (dunningCase.status === DunningCaseStatus.RETRY_SCHEDULED) {
      nextRetryAt = calculateNextRetryAt(
        retrySchedule,
        dunningCase.attempt_count,
        changedAt
      )
      nextStatus = DunningCaseStatus.RETRY_SCHEDULED
    } else if (dunningCase.status === DunningCaseStatus.AWAITING_MANUAL_RESOLUTION) {
      nextRetryAt = null
      nextStatus = DunningCaseStatus.AWAITING_MANUAL_RESOLUTION
    }

    if (
      nextStatus === DunningCaseStatus.RETRY_SCHEDULED &&
      !nextRetryAt
    ) {
      throw dunningErrors.invalidRetryScheduleOverride(dunningCase.id)
    }

    const updated = await dunningModule.updateDunningCases({
      id: dunningCase.id,
      status: nextStatus,
      retry_schedule: retrySchedule,
      max_attempts: input.max_attempts,
      next_retry_at: nextRetryAt,
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
