import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type {
  GetAdminSubscriptionLogSchemaType,
  GetAdminSubscriptionLogsSchemaType,
} from "./validators"
import {
  getAdminSubscriptionLogDetail,
  getAdminSubscriptionTimeline,
  listAdminSubscriptionLogs,
  type ListAdminSubscriptionLogsInput,
} from "../../../modules/activity-log/utils/admin-query"

export function normalizeAdminSubscriptionLogsListQuery(
  query: GetAdminSubscriptionLogsSchemaType
): ListAdminSubscriptionLogsInput {
  const normalized: ListAdminSubscriptionLogsInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    subscription_id: query.subscription_id,
    customer_id: query.customer_id,
    event_type: query.event_type,
    actor_type: query.actor_type,
    date_from: query.date_from,
    date_to: query.date_to,
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

export async function getAdminSubscriptionLogsListResponse(
  container: MedusaContainer,
  query: GetAdminSubscriptionLogsSchemaType
) {
  return await listAdminSubscriptionLogs(
    container,
    normalizeAdminSubscriptionLogsListQuery(query)
  )
}

export async function getAdminSubscriptionLogDetailResponse(
  container: MedusaContainer,
  id: string,
  _query?: GetAdminSubscriptionLogSchemaType
) {
  return await getAdminSubscriptionLogDetail(container, id)
}

export async function getAdminSubscriptionTimelineResponse(
  container: MedusaContainer,
  subscriptionId: string,
  query: GetAdminSubscriptionLogsSchemaType
) {
  const {
    subscription_id: _subscriptionId,
    ...normalized
  } = normalizeAdminSubscriptionLogsListQuery(query)

  return await getAdminSubscriptionTimeline(container, subscriptionId, {
    ...normalized,
  })
}

export function mapActivityLogAdminRouteError(error: unknown) {
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
    error instanceof Error ? error.message : "Unexpected activity log admin error"
  const normalized = message.toLowerCase()

  if (normalized.includes("not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  if (normalized.includes("invalid") || normalized.includes("unsupported")) {
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
