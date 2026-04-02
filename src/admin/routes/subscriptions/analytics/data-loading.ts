import { HttpTypes } from "@medusajs/framework/types"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { sdk } from "../../../lib/client"
import type {
  AdminAnalyticsFilters,
  AnalyticsKpisAdminResponse,
  AnalyticsTrendsAdminResponse,
} from "../../../types/analytics"

export const adminAnalyticsQueryKeys = {
  all: ["admin-analytics"] as const,
  kpis: (filters: AdminAnalyticsFilters) =>
    [...adminAnalyticsQueryKeys.all, "kpis", filters] as const,
  trends: (filters: AdminAnalyticsFilters) =>
    [...adminAnalyticsQueryKeys.all, "trends", filters] as const,
  products: () => [...adminAnalyticsQueryKeys.all, "products"] as const,
}

export function getAdminAnalyticsQueryInput(filters: AdminAnalyticsFilters) {
  return {
    date_from: filters.date_from ? toUtcStartOfDay(filters.date_from) : undefined,
    date_to: filters.date_to ? toUtcEndOfDay(filters.date_to) : undefined,
    status: filters.status.length ? filters.status : undefined,
    product_id: filters.product_id.length ? filters.product_id : undefined,
    frequency: filters.frequency.length
      ? filters.frequency.map((filter) => `${filter.interval}:${filter.value}`)
      : undefined,
    group_by: filters.group_by,
    timezone: "UTC" as const,
  }
}

export function useAdminAnalyticsKpisQuery(filters: AdminAnalyticsFilters) {
  const query = getAdminAnalyticsQueryInput(filters)

  return useQuery<AnalyticsKpisAdminResponse>({
    queryKey: adminAnalyticsQueryKeys.kpis(filters),
    queryFn: () =>
      sdk.client.fetch("/admin/subscription-analytics/kpis", {
        query,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminAnalyticsTrendsQuery(filters: AdminAnalyticsFilters) {
  const query = getAdminAnalyticsQueryInput(filters)

  return useQuery<AnalyticsTrendsAdminResponse>({
    queryKey: adminAnalyticsQueryKeys.trends(filters),
    queryFn: () =>
      sdk.client.fetch("/admin/subscription-analytics/trends", {
        query,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminAnalyticsProductsQuery() {
  return useQuery<HttpTypes.AdminProductListResponse>({
    queryKey: adminAnalyticsQueryKeys.products(),
    queryFn: () =>
      sdk.admin.product.list({
        limit: 100,
        offset: 0,
        order: "title",
      }),
  })
}

function toUtcStartOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day) {
    return undefined
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString()
}

function toUtcEndOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day) {
    return undefined
  }

  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString()
}
