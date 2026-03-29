import type { MedusaContainer } from "@medusajs/framework/types"
import type { GetAdminSubscriptionOffersSchemaType } from "./validators"
import {
  getAdminPlanOfferDetail,
  listAdminPlanOffers,
  type ListAdminPlanOffersInput,
} from "../../../modules/plan-offer/utils/admin-query"

export function normalizeAdminSubscriptionOffersListQuery(
  query: GetAdminSubscriptionOffersSchemaType
): ListAdminPlanOffersInput {
  const normalized: ListAdminPlanOffersInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    is_enabled: query.is_enabled,
    scope: query.scope,
    product_id: query.product_id,
    variant_id: query.variant_id,
    frequency: query.frequency,
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

export async function getAdminSubscriptionOfferDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminPlanOfferDetail(container, id)
}

export async function getAdminSubscriptionOffersListResponse(
  container: MedusaContainer,
  query: GetAdminSubscriptionOffersSchemaType
) {
  return await listAdminPlanOffers(
    container,
    normalizeAdminSubscriptionOffersListQuery(query)
  )
}
