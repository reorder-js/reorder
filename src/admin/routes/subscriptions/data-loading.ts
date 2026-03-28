import {
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import {
  SubscriptionAdminListResponse,
  SubscriptionAdminStatus,
} from "../../types/subscription"

type UseAdminSubscriptionsDisplayQueryInput = {
  pagination: DataTablePaginationState
  search: string
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

export const adminSubscriptionsQueryKeys = {
  all: ["admin-subscriptions"] as const,
  display: (params: {
    pageSize: number
    offset: number
    search: string
    status: SubscriptionAdminStatus[]
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

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
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
