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
import { invalidateAdminActivityLogQueries } from "../activity-log/data-loading"
import {
  CancellationCaseAdminDetailResponse,
  CancellationCaseAdminListResponse,
  CancellationCaseAdminStatus,
  CancellationFinalOutcomeAdmin,
  CancellationRecommendedActionAdmin,
} from "../../../types/cancellation"

type UseAdminCancellationsDisplayQueryInput = {
  pagination: DataTablePaginationState
  search: string
  filtering: DataTableFilteringState
  sorting: DataTableSortingState | null
}

type OfferTypeFilter =
  | CancellationRecommendedActionAdmin.PAUSE_OFFER
  | CancellationRecommendedActionAdmin.DISCOUNT_OFFER
  | CancellationRecommendedActionAdmin.BONUS_OFFER

export const adminCancellationsQueryKeys = {
  all: ["admin-cancellations"] as const,
  detail: (id: string) =>
    [...adminCancellationsQueryKeys.all, "detail", id] as const,
  actionForm: (id: string) =>
    [...adminCancellationsQueryKeys.all, "action-form", id] as const,
  analytics: ["admin-cancellations", "analytics"] as const,
  display: (params: {
    pageSize: number
    offset: number
    search: string
    reasonCategory: string[]
    finalOutcome: CancellationFinalOutcomeAdmin[]
    offerType: OfferTypeFilter[]
    createdFrom?: string
    createdTo?: string
    sortingId?: string
    sortingDesc?: boolean
  }) =>
    [
      ...adminCancellationsQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.reasonCategory,
      params.finalOutcome,
      params.offerType,
      params.createdFrom,
      params.createdTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
}

export function getAdminCancellationsDisplayQueryInput(
  input: UseAdminCancellationsDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize
  const reasonCategory = Array.isArray(input.filtering.reason_category)
    ? (input.filtering.reason_category as string[])
    : []
  const finalOutcome = Array.isArray(input.filtering.final_outcome)
    ? (input.filtering.final_outcome as CancellationFinalOutcomeAdmin[])
    : []
  const offerType = Array.isArray(input.filtering.offer_type)
    ? (input.filtering.offer_type as OfferTypeFilter[])
    : []
  const createdFrom =
    typeof input.filtering.created_from === "string"
      ? toIsoDateTime(input.filtering.created_from)
      : undefined
  const createdTo =
    typeof input.filtering.created_to === "string"
      ? toIsoDateTime(input.filtering.created_to)
      : undefined

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    reasonCategory,
    finalOutcome,
    offerType,
    createdFrom,
    createdTo,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  }
}

export function useAdminCancellationsDisplayQuery(
  input: UseAdminCancellationsDisplayQueryInput
) {
  const queryInput = getAdminCancellationsDisplayQueryInput(input)

  return useQuery<CancellationCaseAdminListResponse>({
    queryKey: adminCancellationsQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/cancellations", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
          reason_category: queryInput.reasonCategory.length
            ? queryInput.reasonCategory
            : undefined,
          final_outcome: queryInput.finalOutcome.length
            ? queryInput.finalOutcome
            : undefined,
          offer_type: queryInput.offerType.length
            ? queryInput.offerType
            : undefined,
          created_from: queryInput.createdFrom,
          created_to: queryInput.createdTo,
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

export function useAdminCancellationDetailQuery(
  id?: string,
  initialData?: CancellationCaseAdminDetailResponse
) {
  return useQuery<CancellationCaseAdminDetailResponse>({
    queryKey: adminCancellationsQueryKeys.detail(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/cancellations/${id}`),
    enabled: Boolean(id),
    initialData,
  })
}

export function useAdminCancellationActionFormQuery(
  id?: string,
  enabled = false,
  initialData?: CancellationCaseAdminDetailResponse
) {
  return useQuery<CancellationCaseAdminDetailResponse>({
    queryKey: adminCancellationsQueryKeys.actionForm(id ?? ""),
    queryFn: () => sdk.client.fetch(`/admin/cancellations/${id}`),
    enabled: enabled && Boolean(id),
    initialData,
  })
}

export async function invalidateAdminCancellationQueries(
  queryClient: QueryClient,
  id?: string,
  subscriptionId?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminCancellationsQueryKeys.all,
    }),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminCancellationsQueryKeys.detail(id),
        })
      : Promise.resolve(),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminCancellationsQueryKeys.actionForm(id),
        })
      : Promise.resolve(),
    queryClient.invalidateQueries({
      queryKey: adminCancellationsQueryKeys.analytics,
    }),
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
