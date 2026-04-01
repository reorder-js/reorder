import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { GetAdminCancellationsSchemaType } from "./validators"
import {
  getAdminCancellationDetail,
  listAdminCancellationCases,
  type ListAdminCancellationCasesInput,
} from "../../../modules/cancellation/utils/admin-query"

export function normalizeAdminCancellationsListQuery(
  query: GetAdminCancellationsSchemaType
): ListAdminCancellationCasesInput {
  const normalized: ListAdminCancellationCasesInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    status: query.status,
    final_outcome: query.final_outcome,
    reason_category: query.reason_category,
    subscription_id: query.subscription_id,
    created_from: query.created_from,
    created_to: query.created_to,
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

export async function getAdminCancellationDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminCancellationDetail(container, id)
}

export async function getAdminCancellationsListResponse(
  container: MedusaContainer,
  query: GetAdminCancellationsSchemaType
) {
  return await listAdminCancellationCases(
    container,
    normalizeAdminCancellationsListQuery(query)
  )
}

export function mapCancellationAdminRouteError(error: unknown) {
  if (error instanceof MedusaError) {
    const typeToStatus: Record<string, number> = {
      [MedusaError.Types.NOT_FOUND]: 404,
      [MedusaError.Types.INVALID_DATA]: 400,
      [MedusaError.Types.CONFLICT]: 409,
    }

    return {
      status: typeToStatus[error.type] ?? 500,
      type: error.type,
      message: error.message,
    }
  }

  const message =
    error instanceof Error ? error.message : "Unexpected cancellation admin error"
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
