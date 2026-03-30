import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DunningCaseStatus } from "../types"

export type ListDueDunningCasesInput = {
  limit: number
  now?: Date
}

export type DueDunningCaseRecord = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  next_retry_at: string
}

export type DueDunningCasesResult = {
  cases: DueDunningCaseRecord[]
  count: number
  limit: number
}

const schedulerCaseFields = [
  "id",
  "subscription_id",
  "renewal_cycle_id",
  "renewal_order_id",
  "status",
  "attempt_count",
  "max_attempts",
  "next_retry_at",
] as const

export async function listDueDunningCasesForProcessing(
  container: MedusaContainer,
  input: ListDueDunningCasesInput
): Promise<DueDunningCasesResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = input.now ?? new Date()

  const {
    data,
    metadata: { count = 0, take = input.limit } = {},
  } = await query.graph({
    entity: "dunning_case",
    fields: [...schedulerCaseFields],
    filters: {
      status: [DunningCaseStatus.RETRY_SCHEDULED],
      next_retry_at: {
        $lte: now,
      },
    },
    pagination: {
      take: input.limit,
      skip: 0,
      order: {
        next_retry_at: "ASC",
      },
    },
  })

  return {
    cases: data as DueDunningCaseRecord[],
    count,
    limit: take,
  }
}
