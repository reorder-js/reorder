import {
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
} from "@medusajs/ui"
import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { invalidateAdminActivityLogQueries } from "./activity-log/data-loading"
import { invalidateAdminAnalyticsQueries } from "./analytics/data-loading"
import {
  SubscriptionAdminListResponse,
  SubscriptionAdminDetailResponse,
  SubscriptionAdminStatus,
} from "../../types/subscription"
import { HttpTypes } from "@medusajs/framework/types"
import {
  ActivityLogAdminDetailResponse,
  ActivityLogAdminListResponse,
} from "../../types/activity-log"

type NextRenewalFilterValue =
  | "overdue"
  | "next_7_days"
  | "next_30_days"
  | "next_90_days"

type UseAdminSubscriptionsDisplayQueryInput = {
  pagination: DataTablePaginationState
  search: string
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

export const adminSubscriptionsQueryKeys = {
  all: ["admin-subscriptions"] as const,
  detail: (id: string) => [...adminSubscriptionsQueryKeys.all, "detail", id] as const,
  detailLogs: (id: string) =>
    [...adminSubscriptionsQueryKeys.all, "detail-logs", id] as const,
  logDetail: (logId: string) =>
    [...adminSubscriptionsQueryKeys.all, "log-detail", logId] as const,
  planOptions: (productId: string) =>
    [...adminSubscriptionsQueryKeys.all, "plan-options", productId] as const,
  display: (params: {
    pageSize: number
    offset: number
    search: string
    status: SubscriptionAdminStatus[]
    isTrial?: boolean
    skipNextCycle?: boolean
    nextRenewalFilter?: NextRenewalFilterValue
    nextRenewalFrom?: string
    nextRenewalTo?: string
    sortingId?: string
    sortingDesc?: boolean
  }) =>
    [
      ...adminSubscriptionsQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.status,
      params.isTrial,
      params.skipNextCycle,
      params.nextRenewalFilter,
      params.nextRenewalFrom,
      params.nextRenewalTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
}

export function getAdminSubscriptionsDisplayQueryInput(
  input: UseAdminSubscriptionsDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize
  const status = Array.isArray(input.filtering.status)
    ? (input.filtering.status as SubscriptionAdminStatus[])
    : []
  const isTrial =
    typeof input.filtering.is_trial === "boolean"
      ? input.filtering.is_trial
      : undefined
  const skipNextCycle =
    typeof input.filtering.skip_next_cycle === "boolean"
      ? input.filtering.skip_next_cycle
      : undefined
  const nextRenewalFilter =
    typeof input.filtering.next_renewal === "string"
      ? (input.filtering.next_renewal as NextRenewalFilterValue)
      : undefined
  const nextRenewalRange = getNextRenewalRange(nextRenewalFilter)

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
    isTrial,
    skipNextCycle,
    nextRenewalFilter,
    nextRenewalFrom: nextRenewalRange?.from,
    nextRenewalTo: nextRenewalRange?.to,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  }
}

export function useAdminSubscriptionsDisplayQuery(
  input: UseAdminSubscriptionsDisplayQueryInput
) {
  const queryInput = getAdminSubscriptionsDisplayQueryInput(input)

  return useQuery<SubscriptionAdminListResponse>({
    queryKey: adminSubscriptionsQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/subscriptions", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
          status: queryInput.status.length ? queryInput.status : undefined,
          is_trial: queryInput.isTrial,
          skip_next_cycle: queryInput.skipNextCycle,
          next_renewal_from: queryInput.nextRenewalFrom,
          next_renewal_to: queryInput.nextRenewalTo,
          order: queryInput.sortingId,
          direction:
            queryInput.sortingId && typeof queryInput.sortingDesc === "boolean"
              ? queryInput.sortingDesc
                ? "desc"
                : "asc"
              : undefined,
        },
      }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminSubscriptionDetailQuery(
  id?: string,
  initialData?: SubscriptionAdminDetailResponse
) {
  return useQuery<SubscriptionAdminDetailResponse>({
    queryKey: adminSubscriptionsQueryKeys.detail(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/subscriptions/${id}`),
    enabled: Boolean(id),
    initialData,
  })
}

export function useAdminSubscriptionLogsQuery(id?: string) {
  return useQuery<ActivityLogAdminListResponse>({
    queryKey: adminSubscriptionsQueryKeys.detailLogs(id ?? ""),
    queryFn: () =>
      sdk.client.fetch(`/admin/subscriptions/${id}/logs`, {
        query: {
          limit: 20,
          offset: 0,
          order: "created_at",
          direction: "desc",
        },
      }),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  })
}

export function useAdminSubscriptionLogDetailQuery(
  logId?: string,
  enabled = false,
  initialData?: ActivityLogAdminDetailResponse
) {
  return useQuery<ActivityLogAdminDetailResponse>({
    queryKey: adminSubscriptionsQueryKeys.logDetail(logId ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/subscription-logs/${logId}`),
    enabled: enabled && Boolean(logId),
    initialData,
  })
}

export function useAdminSubscriptionPlanOptionsQuery(
  productId?: string,
  enabled = false
) {
  return useQuery<HttpTypes.AdminProductVariantListResponse>({
    queryKey: adminSubscriptionsQueryKeys.planOptions(productId ?? ""),
    queryFn: () =>
      sdk.admin.product.listVariants(productId!, {
        limit: 100,
        offset: 0,
      }),
    enabled: enabled && Boolean(productId),
  })
}

export async function invalidateAdminSubscriptionsQueries(
  queryClient: QueryClient,
  id?: string,
  logId?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminSubscriptionsQueryKeys.all,
    }),
    ...(id
      ? [
          queryClient.invalidateQueries({
            queryKey: adminSubscriptionsQueryKeys.detail(id),
          }),
          queryClient.invalidateQueries({
            queryKey: adminSubscriptionsQueryKeys.detailLogs(id),
          }),
        ]
      : []),
    ...(logId
      ? [
          queryClient.invalidateQueries({
            queryKey: adminSubscriptionsQueryKeys.logDetail(logId),
          }),
        ]
      : []),
    invalidateAdminAnalyticsQueries(queryClient),
    invalidateAdminActivityLogQueries(queryClient, {
      id: logId,
      subscriptionId: id,
    }),
  ])
}

export async function invalidateSubscriptionDetailQueries(
  queryClient: QueryClient,
  id?: string,
  logId?: string
) {
  await invalidateAdminSubscriptionsQueries(queryClient, id, logId)
}

function getNextRenewalRange(value?: NextRenewalFilterValue) {
  if (!value) {
    return
  }

  const now = new Date()

  switch (value) {
    case "overdue":
      return {
        to: now.toISOString(),
      }
    case "next_7_days":
      return {
        from: now.toISOString(),
        to: addDays(now, 7).toISOString(),
      }
    case "next_30_days":
      return {
        from: now.toISOString(),
        to: addDays(now, 30).toISOString(),
      }
    case "next_90_days":
      return {
        from: now.toISOString(),
        to: addDays(now, 90).toISOString(),
      }
  }
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}
