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

type UseAdminSubscriptionTimelineQueryInput = {
  id?: string
  pagination: DataTablePaginationState
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

export const adminSubscriptionsQueryKeys = {
  all: ["admin-subscriptions"] as const,
  detail: (id: string) => [...adminSubscriptionsQueryKeys.all, "detail", id] as const,
  detailLogs: (id: string) =>
    [...adminSubscriptionsQueryKeys.all, "detail-logs", id] as const,
  detailLogsDisplay: (params: {
    id: string
    pageSize: number
    offset: number
    eventType: string[]
    actorType: string[]
    dateFrom?: string
    dateTo?: string
    sortingId?: string
    sortingDesc?: boolean
  }) =>
    [
      ...adminSubscriptionsQueryKeys.all,
      "detail-logs-display",
      params.id,
      params.pageSize,
      params.offset,
      params.eventType,
      params.actorType,
      params.dateFrom,
      params.dateTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
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

export function getAdminSubscriptionTimelineQueryInput(
  input: UseAdminSubscriptionTimelineQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize
  const eventType = Array.isArray(input.filtering.event_type)
    ? (input.filtering.event_type as string[])
    : []
  const actorType = Array.isArray(input.filtering.actor_type)
    ? (input.filtering.actor_type as string[])
    : []
  const dateFrom =
    typeof input.filtering.date_from === "string"
      ? toIsoDateTime(input.filtering.date_from)
      : undefined
  const dateTo =
    typeof input.filtering.date_to === "string"
      ? toIsoDateTime(input.filtering.date_to)
      : undefined

  return {
    id: input.id ?? "",
    pageSize: input.pagination.pageSize,
    offset,
    eventType,
    actorType,
    dateFrom,
    dateTo,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  }
}

export function useAdminSubscriptionTimelineQuery(
  input: UseAdminSubscriptionTimelineQueryInput
) {
  const queryInput = getAdminSubscriptionTimelineQueryInput(input)

  return useQuery<ActivityLogAdminListResponse>({
    queryKey: adminSubscriptionsQueryKeys.detailLogsDisplay(queryInput),
    queryFn: () =>
      sdk.client.fetch(`/admin/subscriptions/${queryInput.id}/logs`, {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          event_type: queryInput.eventType.length
            ? queryInput.eventType
            : undefined,
          actor_type: queryInput.actorType.length
            ? queryInput.actorType
            : undefined,
          date_from: queryInput.dateFrom,
          date_to: queryInput.dateTo,
          order: queryInput.sortingId,
          direction:
            queryInput.sortingId &&
            typeof queryInput.sortingDesc === "boolean"
              ? queryInput.sortingDesc
                ? "desc"
                : "asc"
              : undefined,
        },
      }),
    enabled: Boolean(input.id),
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

function toIsoDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toISOString()
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}
