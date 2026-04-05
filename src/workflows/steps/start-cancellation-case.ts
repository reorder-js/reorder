import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CANCELLATION_MODULE } from "../../modules/cancellation"
import type CancellationModuleService from "../../modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationReasonCategory,
} from "../../modules/cancellation/types"
import { appendCancellationManualAction } from "../../modules/cancellation/utils/audit"
import { cancellationErrors } from "../../modules/cancellation/utils/errors"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { SubscriptionStatus } from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"
import type { SubscriptionSettingsShape } from "../../modules/settings/utils/normalize-settings"
import { CancellationSubscriptionDisplayRecord } from "./shared-cancellation-log"
import { getEffectiveSubscriptionSettings } from "../utils/subscription-settings"

const ACTIVE_CANCELLATION_CASE_STATUSES = new Set<CancellationCaseStatus>([
  CancellationCaseStatus.REQUESTED,
  CancellationCaseStatus.EVALUATING_RETENTION,
  CancellationCaseStatus.RETENTION_OFFERED,
])

type SubscriptionRecord = {
  id: string
  reference: string
  status: SubscriptionStatus
  customer_id: string
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
}

type CancellationCaseRecord = {
  id: string
  subscription_id: string
  status: CancellationCaseStatus
  reason: string | null
  reason_category: CancellationReasonCategory | null
  notes: string | null
  final_outcome: string | null
  finalized_at: Date | null
  finalized_by: string | null
  cancellation_effective_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

type EntryContext = {
  source: "subscription_list" | "subscription_detail" | "admin_manual"
  triggered_by?: string | null
  triggered_at?: string | Date | null
  reason?: string | null
}

export type StartCancellationCaseStepInput = {
  subscription_id: string
  reason?: string | null
  reason_category?: CancellationReasonCategory | null
  notes?: string | null
  entry_context?: EntryContext | null
  metadata?: Record<string, unknown> | null
}

type StartCancellationCaseStepOutput = {
  action: "created" | "updated"
  current: CancellationCaseRecord
  previous: CancellationCaseRecord | null
  subscription: CancellationSubscriptionDisplayRecord
}

type StartCancellationCaseCompensation =
  | {
      action: "created"
      created_case_id: string
    }
  | {
      action: "updated"
      previous_case: CancellationCaseRecord
    }

function isActiveCancellationCase(status: CancellationCaseStatus) {
  return ACTIVE_CANCELLATION_CASE_STATUSES.has(status)
}

function normalizeEntryContext(input: StartCancellationCaseStepInput) {
  const rawTriggeredAt = input.entry_context?.triggered_at
  const triggeredAt = rawTriggeredAt
    ? rawTriggeredAt instanceof Date
      ? rawTriggeredAt
      : new Date(rawTriggeredAt)
    : new Date()

  if (Number.isNaN(triggeredAt.getTime())) {
    throw cancellationErrors.invalidData(
      "Cancellation entry_context.triggered_at must be a valid date"
    )
  }

  return {
    source: input.entry_context?.source ?? "admin_manual",
    triggered_by: input.entry_context?.triggered_by ?? null,
    triggered_at: triggeredAt.toISOString(),
    reason: input.entry_context?.reason ?? input.reason ?? null,
  }
}

async function loadSubscription(
  container: { resolve(key: string): unknown },
  id: string
) {
  const subscriptionModule =
    container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService

  try {
    return (await subscriptionModule.retrieveSubscription(id)) as SubscriptionRecord
  } catch {
    throw subscriptionErrors.notFound("Subscription", id)
  }
}

function validateSubscriptionEntryState(subscription: SubscriptionRecord) {
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAUSED &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw subscriptionErrors.invalidState(
      subscription.id,
      "enter cancellation handling",
      subscription.status
    )
  }
}

function mergeCaseMetadata(
  existingMetadata: Record<string, unknown> | null,
  input: StartCancellationCaseStepInput,
  entryContext: ReturnType<typeof normalizeEntryContext>,
  settings?: SubscriptionSettingsShape
) {
  const base = {
    ...(existingMetadata ?? {}),
    ...(input.metadata ?? {}),
    origin: "admin_cancel_intent",
    entry_context: entryContext,
    ...(settings
      ? {
          settings_policy: {
            default_cancellation_behavior:
              settings.default_cancellation_behavior,
            settings_version: settings.version,
            is_persisted: settings.is_persisted,
          },
        }
      : {}),
  }

  return appendCancellationManualAction(base, {
    action: "start_case",
    who: entryContext.triggered_by,
    when: entryContext.triggered_at,
    why: entryContext.reason,
    data: {
      entry_source: entryContext.source,
    },
  })
}

export const startCancellationCaseStep = createStep(
  "start-cancellation-case",
  async function (
    input: StartCancellationCaseStepInput,
    { container }
  ) {
    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    if (!input.subscription_id?.trim()) {
      throw cancellationErrors.invalidData(
        "Cancellation start requires a subscription_id"
      )
    }

    const subscription = await loadSubscription(container, input.subscription_id)
    validateSubscriptionEntryState(subscription)

    const entryContext = normalizeEntryContext(input)
    const settings = await getEffectiveSubscriptionSettings(container)

    const subscriptionCases = (await cancellationModule.listCancellationCases({
      subscription_id: subscription.id,
    } as any)) as CancellationCaseRecord[]

    const activeCases = subscriptionCases.filter((cancellationCase) =>
      isActiveCancellationCase(cancellationCase.status)
    )

    if (activeCases.length > 1) {
      throw cancellationErrors.multipleActiveCases(subscription.id)
    }

    const activeCase = activeCases[0] ?? null

    if (activeCase) {
      const updated = (await cancellationModule.updateCancellationCases({
        id: activeCase.id,
        reason: activeCase.reason ?? input.reason ?? null,
        reason_category:
          activeCase.reason_category ?? input.reason_category ?? null,
        notes: activeCase.notes ?? input.notes ?? null,
        metadata: mergeCaseMetadata(activeCase.metadata, input, entryContext),
      } as any)) as CancellationCaseRecord

      return new StepResponse<
        StartCancellationCaseStepOutput,
        StartCancellationCaseCompensation
      >(
        {
          action: "updated",
          current: updated,
          previous: activeCase,
          subscription: subscription as CancellationSubscriptionDisplayRecord,
        },
        {
          action: "updated",
          previous_case: activeCase,
        }
      )
    }

    const created = (await cancellationModule.createCancellationCases({
      subscription_id: subscription.id,
      status: CancellationCaseStatus.REQUESTED,
      reason: input.reason ?? null,
      reason_category: input.reason_category ?? null,
      notes: input.notes ?? null,
      final_outcome: null,
      finalized_at: null,
      finalized_by: null,
      cancellation_effective_at: null,
      metadata: mergeCaseMetadata(null, input, entryContext, settings),
    } as any)) as CancellationCaseRecord

    return new StepResponse<
      StartCancellationCaseStepOutput,
      StartCancellationCaseCompensation
    >(
      {
        action: "created",
        current: created,
        previous: null,
        subscription: subscription as CancellationSubscriptionDisplayRecord,
      },
      {
        action: "created",
        created_case_id: created.id,
      }
    )
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const cancellationModule =
      container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

    if (compensation.action === "created") {
      await cancellationModule.deleteCancellationCases(compensation.created_case_id)
      return
    }

    await cancellationModule.updateCancellationCases(compensation.previous_case as any)
  }
)
