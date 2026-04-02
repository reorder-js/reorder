import {
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
} from "@medusajs/ui"
import {
  keepPreviousData,
  QueryClient,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../../lib/client"
import {
  ActivityLogAdminActorType,
  ActivityLogAdminDetailResponse,
  ActivityLogAdminListResponse,
} from "../../../types/activity-log"

type UseAdminActivityLogDisplayQueryInput = {
  pagination: DataTablePaginationState
  search: string
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

export const adminActivityLogQueryKeys = {
  all: ["admin-activity-log"] as const,
  detail: (id: string) =>
    [...adminActivityLogQueryKeys.all, "detail", id] as const,
  display: (params: {
    pageSize: number
    offset: number
    search: string
    eventType: string[]
    actorType: ActivityLogAdminActorType[]
    dateFrom?: string
    dateTo?: string
    sortingId?: string
    sortingDesc?: boolean
  }) =>
    [
      ...adminActivityLogQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.eventType,
      params.actorType,
      params.dateFrom,
      params.dateTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
}

export function getAdminActivityLogDisplayQueryInput(
  input: UseAdminActivityLogDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize
  const eventType = Array.isArray(input.filtering.event_type)
    ? (input.filtering.event_type as string[])
    : []
  const actorType = Array.isArray(input.filtering.actor_type)
    ? (input.filtering.actor_type as ActivityLogAdminActorType[])
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
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    eventType,
    actorType,
    dateFrom,
    dateTo,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  }
}

export function useAdminActivityLogDisplayQuery(
  input: UseAdminActivityLogDisplayQueryInput
) {
  const queryInput = getAdminActivityLogDisplayQueryInput(input)

  return useQuery<ActivityLogAdminListResponse>({
    queryKey: adminActivityLogQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/subscription-logs", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
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
    placeholderData: keepPreviousData,
  })
}

export function useAdminActivityLogDetailQuery(
  id?: string,
  enabled = false,
  initialData?: ActivityLogAdminDetailResponse
) {
  return useQuery<ActivityLogAdminDetailResponse>({
    queryKey: adminActivityLogQueryKeys.detail(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/subscription-logs/${id}`),
    enabled: enabled && Boolean(id),
    initialData,
  })
}

export async function invalidateAdminActivityLogQueries(
  queryClient: QueryClient,
  id?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminActivityLogQueryKeys.all,
    }),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminActivityLogQueryKeys.detail(id),
        })
      : Promise.resolve(),
  ])
}

function toIsoDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toISOString()
}
