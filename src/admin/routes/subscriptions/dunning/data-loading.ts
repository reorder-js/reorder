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
import { invalidateAdminAnalyticsQueries } from "../analytics/data-loading"
import { invalidateAdminActivityLogQueries } from "../activity-log/data-loading"
import {
  DunningCaseAdminDetailResponse,
  DunningCaseAdminListResponse,
  DunningCaseAdminStatus,
} from "../../../types/dunning"

type UseAdminDunningDisplayQueryInput = {
  pagination: DataTablePaginationState
  search: string
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

export const adminDunningQueryKeys = {
  all: ["admin-dunning"] as const,
  detail: (id: string) => [...adminDunningQueryKeys.all, "detail", id] as const,
  retryScheduleForm: (id: string) =>
    [...adminDunningQueryKeys.all, "retry-schedule-form", id] as const,
  display: (params: {
    pageSize: number
    offset: number
    search: string
    status: DunningCaseAdminStatus[]
    paymentProviderId?: string
    lastPaymentErrorCode?: string
    attemptCountMin?: number
    attemptCountMax?: number
    nextRetryFrom?: string
    nextRetryTo?: string
    sortingId?: string
    sortingDesc?: boolean
  }) =>
    [
      ...adminDunningQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.status,
      params.paymentProviderId,
      params.lastPaymentErrorCode,
      params.attemptCountMin,
      params.attemptCountMax,
      params.nextRetryFrom,
      params.nextRetryTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
}

export function getAdminDunningDisplayQueryInput(
  input: UseAdminDunningDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize
  const status = Array.isArray(input.filtering.status)
    ? (input.filtering.status as DunningCaseAdminStatus[])
    : []
  const paymentProviderId =
    typeof input.filtering.payment_provider_id === "string"
      ? input.filtering.payment_provider_id.trim() || undefined
      : undefined
  const lastPaymentErrorCode =
    typeof input.filtering.last_payment_error_code === "string"
      ? input.filtering.last_payment_error_code.trim() || undefined
      : undefined
  const attemptCountMin = toOptionalNumber(input.filtering.attempt_count_min)
  const attemptCountMax = toOptionalNumber(input.filtering.attempt_count_max)
  const nextRetryFrom =
    typeof input.filtering.next_retry_from === "string"
      ? toIsoDateTime(input.filtering.next_retry_from)
      : undefined
  const nextRetryTo =
    typeof input.filtering.next_retry_to === "string"
      ? toIsoDateTime(input.filtering.next_retry_to)
      : undefined

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
    paymentProviderId,
    lastPaymentErrorCode,
    attemptCountMin,
    attemptCountMax,
    nextRetryFrom,
    nextRetryTo,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  }
}

export function useAdminDunningDisplayQuery(
  input: UseAdminDunningDisplayQueryInput
) {
  const queryInput = getAdminDunningDisplayQueryInput(input)

  return useQuery<DunningCaseAdminListResponse>({
    queryKey: adminDunningQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/dunning", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
          status: queryInput.status.length ? queryInput.status : undefined,
          payment_provider_id: queryInput.paymentProviderId,
          last_payment_error_code: queryInput.lastPaymentErrorCode,
          attempt_count_min: queryInput.attemptCountMin,
          attempt_count_max: queryInput.attemptCountMax,
          next_retry_from: queryInput.nextRetryFrom,
          next_retry_to: queryInput.nextRetryTo,
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

export function useAdminDunningDetailQuery(
  id?: string,
  initialData?: DunningCaseAdminDetailResponse
) {
  return useQuery<DunningCaseAdminDetailResponse>({
    queryKey: adminDunningQueryKeys.detail(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/dunning/${id}`),
    enabled: Boolean(id),
    initialData,
  })
}

export function useAdminDunningRetryScheduleFormQuery(
  id?: string,
  enabled = false,
  initialData?: DunningCaseAdminDetailResponse
) {
  return useQuery<DunningCaseAdminDetailResponse>({
    queryKey: adminDunningQueryKeys.retryScheduleForm(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/dunning/${id}`),
    enabled: enabled && Boolean(id),
    initialData,
  })
}

export async function invalidateAdminDunningQueries(
  queryClient: QueryClient,
  id?: string,
  subscriptionId?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminDunningQueryKeys.all,
    }),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminDunningQueryKeys.detail(id),
        })
      : Promise.resolve(),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminDunningQueryKeys.retryScheduleForm(id),
        })
      : Promise.resolve(),
    invalidateAdminAnalyticsQueries(queryClient),
    invalidateAdminActivityLogQueries(queryClient, {
      subscriptionId,
    }),
  ])
}

function toIsoDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toISOString()
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()

  if (!trimmed.length) {
    return undefined
  }

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? parsed : undefined
}
