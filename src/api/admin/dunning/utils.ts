import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { GetAdminDunningCasesSchemaType } from "./validators"
import {
  getAdminDunningDetail,
  listAdminDunningCases,
  type ListAdminDunningCasesInput,
} from "../../../modules/dunning/utils/admin-query"

export function normalizeAdminDunningCasesListQuery(
  query: GetAdminDunningCasesSchemaType
): ListAdminDunningCasesInput {
  const normalized: ListAdminDunningCasesInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    status: query.status,
    subscription_id: query.subscription_id,
    renewal_cycle_id: query.renewal_cycle_id,
    renewal_order_id: query.renewal_order_id,
    next_retry_from: query.next_retry_from,
    next_retry_to: query.next_retry_to,
    last_attempt_status: query.last_attempt_status,
  }

  if (query.order) {
    if (query.order.startsWith("-")) {
      normalized.order = query.order.slice(1)
      normalized.direction = "desc"
    } else {
      normalized.order = query.order
      normalized.direction = query.direction
    }
  } else {
    normalized.direction = query.direction
  }

  return normalized
}

export async function getAdminDunningDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminDunningDetail(container, id)
}

export async function getAdminDunningCasesListResponse(
  container: MedusaContainer,
  query: GetAdminDunningCasesSchemaType
) {
  return await listAdminDunningCases(
    container,
    normalizeAdminDunningCasesListQuery(query)
  )
}

export function mapDunningAdminRouteError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected dunning admin error"
  const normalized = message.toLowerCase()

  if (normalized.includes("was not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  if (normalized.includes("invalid") || normalized.includes("missing")) {
    return {
      status: 400,
      type: MedusaError.Types.INVALID_DATA,
      message,
    }
  }

  return {
    status: 409,
    type: MedusaError.Types.CONFLICT,
    message,
  }
}
