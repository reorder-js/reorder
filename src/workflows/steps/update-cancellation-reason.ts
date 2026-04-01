import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CANCELLATION_MODULE } from "../../modules/cancellation"
import type CancellationModuleService from "../../modules/cancellation/service"
import {
  CancellationCaseStatus,
  type CancellationReasonCategory,
} from "../../modules/cancellation/types"
import { appendCancellationManualAction } from "../../modules/cancellation/utils/audit"
import { cancellationErrors } from "../../modules/cancellation/utils/errors"

const REASON_MUTABLE_CASE_STATUSES = new Set<CancellationCaseStatus>([
  CancellationCaseStatus.REQUESTED,
  CancellationCaseStatus.EVALUATING_RETENTION,
  CancellationCaseStatus.RETENTION_OFFERED,
])

type CancellationCaseRecord = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: CancellationReasonCategory | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type UpdateCancellationReasonStepInput = {
  cancellation_case_id: string
  reason: string
  reason_category?: CancellationReasonCategory | null
  notes?: string | null
  updated_by?: string | null
  update_reason?: string | null
  metadata?: Record<string, unknown> | null
}

type UpdateCancellationReasonStepOutput = {
  cancellation_case_id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string
  reason_category: CancellationReasonCategory | null
}

type UpdateCancellationReasonCompensation = {
  previous_case: CancellationCaseRecord
}

async function loadCancellationCase(
  container: { resolve(key: string): unknown },
  id: string
) {
  const cancellationModule =
    container.resolve(CANCELLATION_MODULE) as CancellationModuleService

  try {
    return (await cancellationModule.retrieveCancellationCase(
      id
    )) as CancellationCaseRecord
  } catch {
    throw cancellationErrors.notFound("CancellationCase", id)
  }
}

function validateCaseState(cancellationCase: CancellationCaseRecord) {
  if (!REASON_MUTABLE_CASE_STATUSES.has(cancellationCase.status)) {
    throw cancellationErrors.invalidCaseState(
      cancellationCase.id,
      "update cancellation reason",
      cancellationCase.status
    )
  }
}

export const updateCancellationReasonStep = createStep(
  "update-cancellation-reason",
  async function (
    input: UpdateCancellationReasonStepInput,
    { container }
  ) {
    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    if (!input.reason?.trim()) {
      throw cancellationErrors.invalidData(
        "Cancellation reason update requires a non-empty reason"
      )
    }

    const cancellationCase = await loadCancellationCase(
      container,
      input.cancellation_case_id
    )
    validateCaseState(cancellationCase)

    const changedAt = new Date().toISOString()
    const updated = (await cancellationModule.updateCancellationCases({
      id: cancellationCase.id,
      reason: input.reason.trim(),
      reason_category: input.reason_category ?? cancellationCase.reason_category ?? null,
      notes: input.notes ?? cancellationCase.notes ?? null,
      metadata: appendCancellationManualAction(
        {
          ...(cancellationCase.metadata ?? {}),
          ...(input.metadata ?? {}),
          reason_update: {
            reason: input.reason.trim(),
            reason_category:
              input.reason_category ?? cancellationCase.reason_category ?? null,
            notes: input.notes ?? cancellationCase.notes ?? null,
            updated_by: input.updated_by ?? null,
            updated_at: changedAt,
          },
        },
        {
          action: "update_reason",
          who: input.updated_by ?? null,
          when: changedAt,
          why: input.update_reason ?? input.reason.trim(),
          data: {
            reason_category:
              input.reason_category ?? cancellationCase.reason_category ?? null,
          },
        }
      ),
    } as any)) as CancellationCaseRecord

    return new StepResponse<
      UpdateCancellationReasonStepOutput,
      UpdateCancellationReasonCompensation
    >(
      {
        cancellation_case_id: updated.id,
        subscription_id: updated.subscription_id,
        status: updated.status,
        reason: updated.reason ?? input.reason.trim(),
        reason_category: updated.reason_category,
      },
      {
        previous_case: cancellationCase,
      }
    )
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    await cancellationModule.updateCancellationCases(compensation.previous_case as any)
  }
)
