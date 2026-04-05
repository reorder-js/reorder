import type { MedusaContainer } from "@medusajs/framework/types"
import { CANCELLATION_MODULE } from "../../src/modules/cancellation"
import type CancellationModuleService from "../../src/modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
  type RetentionOfferPayload,
} from "../../src/modules/cancellation/types"
import {
  createAdminAuthHeaders,
  createDunningCaseSeed,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "./dunning-fixtures"

type CancellationCaseSeedInput = {
  id?: string
  subscription_id: string
  status?: CancellationCaseStatus
  reason?: string | null
  reason_category?: CancellationReasonCategory | null
  notes?: string | null
  final_outcome?: CancellationFinalOutcome | null
  finalized_at?: Date | null
  finalized_by?: string | null
  cancellation_effective_at?: Date | null
  metadata?: Record<string, unknown> | null
}

type RetentionOfferEventSeedInput = {
  id?: string
  cancellation_case_id: string
  offer_type?: RetentionOfferType
  offer_payload?: RetentionOfferPayload | null
  decision_status?: RetentionOfferDecisionStatus
  decision_reason?: string | null
  decided_at?: Date | null
  decided_by?: string | null
  applied_at?: Date | null
  metadata?: Record<string, unknown> | null
}

export {
  createAdminAuthHeaders,
  createDunningCaseSeed,
  createRenewalCycleSeed,
  createSubscriptionSeed,
}

export async function createCancellationCaseSeed(
  container: MedusaContainer,
  input: CancellationCaseSeedInput
) {
  const cancellationModule =
    container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

  return await cancellationModule.createCancellationCases({
    id: input.id,
    subscription_id: input.subscription_id,
    status: input.status ?? CancellationCaseStatus.REQUESTED,
    reason: input.reason === undefined ? null : input.reason,
    reason_category:
      input.reason_category === undefined ? null : input.reason_category,
    notes: input.notes === undefined ? null : input.notes,
    final_outcome:
      input.final_outcome === undefined ? null : input.final_outcome,
    finalized_at: input.finalized_at === undefined ? null : input.finalized_at,
    finalized_by:
      input.finalized_by === undefined ? null : input.finalized_by,
    cancellation_effective_at:
      input.cancellation_effective_at === undefined
        ? null
        : input.cancellation_effective_at,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}

export async function createRetentionOfferEventSeed(
  container: MedusaContainer,
  input: RetentionOfferEventSeedInput
) {
  const cancellationModule =
    container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

  return await cancellationModule.createRetentionOfferEvents({
    id: input.id,
    cancellation_case_id: input.cancellation_case_id,
    offer_type: input.offer_type ?? RetentionOfferType.DISCOUNT_OFFER,
    offer_payload:
      input.offer_payload === undefined
        ? {
            discount_offer: {
              discount_type: "percentage",
              discount_value: 10,
              duration_cycles: 2,
              note: "seeded discount",
            },
          }
        : input.offer_payload,
    decision_status:
      input.decision_status ?? RetentionOfferDecisionStatus.APPLIED,
    decision_reason:
      input.decision_reason === undefined ? null : input.decision_reason,
    decided_at: input.decided_at === undefined ? new Date() : input.decided_at,
    decided_by: input.decided_by === undefined ? "seed_admin" : input.decided_by,
    applied_at: input.applied_at === undefined ? new Date() : input.applied_at,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}
