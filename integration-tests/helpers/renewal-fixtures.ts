import type { MedusaContainer } from "@medusajs/framework/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"
import {
  createAdminAuthHeaders,
  createProductWithVariant,
  createSubscriptionSeed,
} from "./subscription-fixtures"

type RenewalCycleSeedInput = {
  id?: string
  subscription_id: string
  scheduled_for?: Date
  processed_at?: Date | null
  status?: RenewalCycleStatus
  approval_required?: boolean
  approval_status?: RenewalApprovalStatus | null
  approval_decided_at?: Date | null
  approval_decided_by?: string | null
  approval_reason?: string | null
  generated_order_id?: string | null
  applied_pending_update_data?: Record<string, unknown> | null
  last_error?: string | null
  attempt_count?: number
  metadata?: Record<string, unknown> | null
}

type RenewalAttemptSeedInput = {
  id?: string
  renewal_cycle_id: string
  attempt_no?: number
  started_at?: Date
  finished_at?: Date | null
  status?: RenewalAttemptStatus
  error_code?: string | null
  error_message?: string | null
  payment_reference?: string | null
  order_id?: string | null
  metadata?: Record<string, unknown> | null
}

export {
  createAdminAuthHeaders,
  createProductWithVariant,
  createSubscriptionSeed,
}

export async function createRenewalCycleSeed(
  container: MedusaContainer,
  input: RenewalCycleSeedInput
) {
  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

  return await renewalModule.createRenewalCycles({
    id: input.id,
    subscription_id: input.subscription_id,
    scheduled_for: input.scheduled_for ?? new Date(),
    processed_at:
      input.processed_at === undefined ? null : input.processed_at,
    status: input.status ?? RenewalCycleStatus.SCHEDULED,
    approval_required: input.approval_required ?? false,
    approval_status:
      input.approval_status === undefined ? null : input.approval_status,
    approval_decided_at:
      input.approval_decided_at === undefined ? null : input.approval_decided_at,
    approval_decided_by:
      input.approval_decided_by === undefined ? null : input.approval_decided_by,
    approval_reason:
      input.approval_reason === undefined ? null : input.approval_reason,
    generated_order_id:
      input.generated_order_id === undefined ? null : input.generated_order_id,
    applied_pending_update_data:
      input.applied_pending_update_data === undefined
        ? null
        : input.applied_pending_update_data,
    last_error: input.last_error === undefined ? null : input.last_error,
    attempt_count: input.attempt_count ?? 0,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}

export async function createRenewalAttemptSeed(
  container: MedusaContainer,
  input: RenewalAttemptSeedInput
) {
  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

  return await renewalModule.createRenewalAttempts({
    id: input.id,
    renewal_cycle_id: input.renewal_cycle_id,
    attempt_no: input.attempt_no ?? 1,
    started_at: input.started_at ?? new Date(),
    finished_at:
      input.finished_at === undefined ? null : input.finished_at,
    status: input.status ?? RenewalAttemptStatus.PROCESSING,
    error_code: input.error_code === undefined ? null : input.error_code,
    error_message:
      input.error_message === undefined ? null : input.error_message,
    payment_reference:
      input.payment_reference === undefined ? null : input.payment_reference,
    order_id: input.order_id === undefined ? null : input.order_id,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}
