import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { GetAdminRenewalsSchemaType } from "./validators"
import {
  getAdminRenewalDetail,
  listAdminRenewals,
  type ListAdminRenewalsInput,
} from "../../../modules/renewal/utils/admin-query"
import { getRenewalErrorMessage } from "../../../modules/renewal/utils/observability"

export function normalizeAdminRenewalsListQuery(
  query: GetAdminRenewalsSchemaType
): ListAdminRenewalsInput {
  const normalized: ListAdminRenewalsInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    status: query.status,
    approval_status: query.approval_status,
    scheduled_from: query.scheduled_from,
    scheduled_to: query.scheduled_to,
    last_attempt_status: query.last_attempt_status,
    subscription_id: query.subscription_id,
    generated_order_id: query.generated_order_id,
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

export async function getAdminRenewalDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminRenewalDetail(container, id)
}

export async function getAdminRenewalsListResponse(
  container: MedusaContainer,
  query: GetAdminRenewalsSchemaType
) {
  return await listAdminRenewals(
    container,
    normalizeAdminRenewalsListQuery(query)
  )
}

export function mapRenewalAdminRouteError(error: unknown) {
  const message = getRenewalErrorMessage(error)
  const normalized = message.toLowerCase()

  if (normalized.includes("was not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  return {
    status: 409,
    type: MedusaError.Types.CONFLICT,
    message,
  }
}
