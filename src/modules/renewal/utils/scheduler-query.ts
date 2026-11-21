import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DunningCaseStatus } from "../../dunning/types"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../types"

export type ListDueRenewalCyclesInput = {
  limit: number
  offset: number
  now?: Date
}

export type DueRenewalCycleRecord = {
  id: string
  subscription_id: string
  scheduled_for: string
  status: RenewalCycleStatus
  approval_required: boolean
  approval_status: RenewalApprovalStatus | null
}

export type DueRenewalCyclesResult = {
  cycles: DueRenewalCycleRecord[]
  count: number
  limit: number
  offset: number
}

const schedulerCycleFields = [
  "id",
  "subscription_id",
  "scheduled_for",
  "status",
  "approval_required",
  "approval_status",
] as const

// A failed cycle whose dunning case is in one of these states is owned by
// `Dunning`: it is either still being retried or was already paid through a
// retry, so the scheduler must not run it again and charge a new renewal order.
const dunningOwnedCaseStatuses = [
  DunningCaseStatus.OPEN,
  DunningCaseStatus.RETRY_SCHEDULED,
  DunningCaseStatus.RETRYING,
  DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
  DunningCaseStatus.RECOVERED,
] as const

function isApprovalEligible(record: DueRenewalCycleRecord) {
  if (!record.approval_required) {
    return true
  }

  return record.approval_status === RenewalApprovalStatus.APPROVED
}

async function listCycleIdsOwnedByDunning(
  container: MedusaContainer,
  failedCycleIds: string[]
): Promise<Set<string>> {
  if (!failedCycleIds.length) {
    return new Set()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "dunning_case",
    fields: ["id", "renewal_cycle_id", "status"],
    filters: {
      renewal_cycle_id: failedCycleIds,
      status: [...dunningOwnedCaseStatuses],
    },
  })

  return new Set(
    (data as Array<{ renewal_cycle_id: string }>).map(
      (dunningCase) => dunningCase.renewal_cycle_id
    )
  )
}

export async function listDueRenewalCyclesForProcessing(
  container: MedusaContainer,
  input: ListDueRenewalCyclesInput
): Promise<DueRenewalCyclesResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = input.now ?? new Date()

  const {
    data,
    metadata: { count = 0, take = input.limit, skip = input.offset } = {},
  } = await query.graph({
    entity: "renewal_cycle",
    fields: [...schedulerCycleFields],
    filters: {
      status: [RenewalCycleStatus.SCHEDULED, RenewalCycleStatus.FAILED],
      scheduled_for: {
        $lte: now,
      },
    },
    pagination: {
      take: input.limit,
      skip: input.offset,
      order: {
        scheduled_for: "ASC",
      },
    },
  })

  const approvalEligibleCycles = (data as DueRenewalCycleRecord[]).filter(
    isApprovalEligible
  )
  const cycleIdsOwnedByDunning = await listCycleIdsOwnedByDunning(
    container,
    approvalEligibleCycles
      .filter((cycle) => cycle.status === RenewalCycleStatus.FAILED)
      .map((cycle) => cycle.id)
  )
  const cycles = approvalEligibleCycles.filter(
    (cycle) => !cycleIdsOwnedByDunning.has(cycle.id)
  )

  return {
    cycles,
    count,
    limit: take,
    offset: skip,
  }
}

