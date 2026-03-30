import type { MedusaContainer } from "@medusajs/framework/types"
import { DUNNING_MODULE } from "../../src/modules/dunning"
import type DunningModuleService from "../../src/modules/dunning/service"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../../src/modules/dunning/types"
import {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "./renewal-fixtures"

type DunningCaseSeedInput = {
  id?: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id?: string | null
  status?: DunningCaseStatus
  attempt_count?: number
  max_attempts?: number
  retry_schedule?: DunningRetrySchedule | null
  next_retry_at?: Date | null
  last_payment_error_code?: string | null
  last_payment_error_message?: string | null
  last_attempt_at?: Date | null
  recovered_at?: Date | null
  closed_at?: Date | null
  recovery_reason?: string | null
  metadata?: Record<string, unknown> | null
}

type DunningAttemptSeedInput = {
  id?: string
  dunning_case_id: string
  attempt_no?: number
  started_at?: Date
  finished_at?: Date | null
  status?: DunningAttemptStatus
  error_code?: string | null
  error_message?: string | null
  payment_reference?: string | null
  metadata?: Record<string, unknown> | null
}

export {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
}

export const defaultRetrySchedule: DunningRetrySchedule = {
  strategy: "fixed_intervals",
  intervals: [1440, 4320, 10080],
  timezone: "UTC",
  source: "default_policy",
}

export async function createDunningCaseSeed(
  container: MedusaContainer,
  input: DunningCaseSeedInput
) {
  const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)

  return await dunningModule.createDunningCases({
    id: input.id,
    subscription_id: input.subscription_id,
    renewal_cycle_id: input.renewal_cycle_id,
    renewal_order_id:
      input.renewal_order_id === undefined ? null : input.renewal_order_id,
    status: input.status ?? DunningCaseStatus.OPEN,
    attempt_count: input.attempt_count ?? 0,
    max_attempts: input.max_attempts ?? 3,
    retry_schedule:
      input.retry_schedule === undefined ? defaultRetrySchedule : input.retry_schedule,
    next_retry_at:
      input.next_retry_at === undefined ? new Date(Date.now() - 60_000) : input.next_retry_at,
    last_payment_error_code:
      input.last_payment_error_code === undefined
        ? null
        : input.last_payment_error_code,
    last_payment_error_message:
      input.last_payment_error_message === undefined
        ? null
        : input.last_payment_error_message,
    last_attempt_at:
      input.last_attempt_at === undefined ? null : input.last_attempt_at,
    recovered_at: input.recovered_at === undefined ? null : input.recovered_at,
    closed_at: input.closed_at === undefined ? null : input.closed_at,
    recovery_reason:
      input.recovery_reason === undefined ? null : input.recovery_reason,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}

export async function createDunningAttemptSeed(
  container: MedusaContainer,
  input: DunningAttemptSeedInput
) {
  const dunningModule = container.resolve<DunningModuleService>(DUNNING_MODULE)

  return await dunningModule.createDunningAttempts({
    id: input.id,
    dunning_case_id: input.dunning_case_id,
    attempt_no: input.attempt_no ?? 1,
    started_at: input.started_at ?? new Date(),
    finished_at: input.finished_at === undefined ? null : input.finished_at,
    status: input.status ?? DunningAttemptStatus.PROCESSING,
    error_code: input.error_code === undefined ? null : input.error_code,
    error_message:
      input.error_message === undefined ? null : input.error_message,
    payment_reference:
      input.payment_reference === undefined ? null : input.payment_reference,
    metadata: input.metadata === undefined ? null : input.metadata,
  } as any)
}
