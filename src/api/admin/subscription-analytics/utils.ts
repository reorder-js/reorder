import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { AnalyticsExportFormat, AnalyticsGroupBy } from "../../../admin/types/analytics"
import {
  getAdminAnalyticsExport,
  getAdminAnalyticsKpis,
  getAdminAnalyticsTrends,
  type ListAdminAnalyticsInput,
} from "../../../modules/analytics/utils/admin-query"
import { getAnalyticsErrorMessage } from "../../../modules/analytics/utils/observability"

export type GetAdminAnalyticsQuery = {
  date_from?: string | null
  date_to?: string | null
  status?: string[] | string | null
  product_id?: string[] | string | null
  frequency?: string[] | string | null
  group_by?: AnalyticsGroupBy | null
  timezone?: "UTC" | null
}

export type GetAdminAnalyticsExportQuery = GetAdminAnalyticsQuery & {
  format?: AnalyticsExportFormat | null
}

function normalizeArrayFilter(value?: string[] | string | null) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export function normalizeAdminAnalyticsQuery(
  query: GetAdminAnalyticsQuery
): ListAdminAnalyticsInput {
  return {
    date_from: query.date_from ?? null,
    date_to: query.date_to ?? null,
    status: normalizeArrayFilter(query.status) as ListAdminAnalyticsInput["status"],
    product_id: normalizeArrayFilter(query.product_id),
    frequency: normalizeArrayFilter(query.frequency),
    group_by: query.group_by ?? undefined,
    timezone: query.timezone ?? undefined,
  }
}

export function normalizeAdminAnalyticsExportQuery(
  query: GetAdminAnalyticsExportQuery
): ListAdminAnalyticsInput {
  return {
    ...normalizeAdminAnalyticsQuery(query),
    format: query.format ?? undefined,
  }
}

export async function getAdminAnalyticsKpisResponse(
  container: MedusaContainer,
  query: GetAdminAnalyticsQuery
) {
  return await getAdminAnalyticsKpis(
    container,
    normalizeAdminAnalyticsQuery(query)
  )
}

export async function getAdminAnalyticsTrendsResponse(
  container: MedusaContainer,
  query: GetAdminAnalyticsQuery
) {
  return await getAdminAnalyticsTrends(
    container,
    normalizeAdminAnalyticsQuery(query)
  )
}

export async function getAdminAnalyticsExportResponse(
  container: MedusaContainer,
  query: GetAdminAnalyticsExportQuery
) {
  return await getAdminAnalyticsExport(
    container,
    normalizeAdminAnalyticsExportQuery(query)
  )
}

export function mapAnalyticsAdminRouteError(error: unknown) {
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
    error instanceof Error ? error.message : getAnalyticsErrorMessage(error)
  const normalized = message.toLowerCase()

  if (normalized.includes("not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("unsupported") ||
    normalized.includes("must be")
  ) {
    return {
      status: 400,
      type: MedusaError.Types.INVALID_DATA,
      message,
    }
  }

  return {
    status: 500,
    type: MedusaError.Types.UNEXPECTED_STATE,
    message,
  }
}
