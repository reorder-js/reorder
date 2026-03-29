import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
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

function isApprovalEligible(record: DueRenewalCycleRecord) {
  if (!record.approval_required) {
    return true
  }

  return record.approval_status === RenewalApprovalStatus.APPROVED
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

  const cycles = (data as DueRenewalCycleRecord[]).filter(isApprovalEligible)

  return {
    cycles,
    count,
    limit: take,
    offset: skip,
  }
}

