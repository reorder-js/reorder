import {
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
} from "@medusajs/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { sdk } from "../../../lib/client";
import {
  PlanOfferAdminListResponse,
  PlanOfferAdminStatus,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
} from "../../../types/plan-offer";

type UseAdminPlanOffersDisplayQueryInput = {
  pagination: DataTablePaginationState;
  search: string;
  filtering: DataTableFilteringState;
  sorting: DataTableSortingState | null;
};

export const adminPlanOffersQueryKeys = {
  all: ["admin-plan-offers"] as const,
  display: (params: {
    pageSize: number;
    offset: number;
    search: string;
    status?: PlanOfferAdminStatus;
    scope?: PlanOfferScope;
    frequency?: PlanOfferFrequencyInterval;
    sortingId?: string;
    sortingDesc?: boolean;
  }) =>
    [
      ...adminPlanOffersQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.status,
      params.scope,
      params.frequency,
      params.sortingId,
      params.sortingDesc,
    ] as const,
};

export function getAdminPlanOffersDisplayQueryInput(
  input: UseAdminPlanOffersDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize;
  const status =
    typeof input.filtering.status === "string"
      ? (input.filtering.status as PlanOfferAdminStatus)
      : undefined;
  const scope =
    typeof input.filtering.scope === "string"
      ? (input.filtering.scope as PlanOfferScope)
      : undefined;
  const frequency =
    typeof input.filtering.frequency === "string"
      ? (input.filtering.frequency as PlanOfferFrequencyInterval)
      : undefined;

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
    scope,
    frequency,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  };
}

export function useAdminPlanOffersDisplayQuery(
  input: UseAdminPlanOffersDisplayQueryInput
) {
  const queryInput = getAdminPlanOffersDisplayQueryInput(input);

  return useQuery<PlanOfferAdminListResponse>({
    queryKey: adminPlanOffersQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/subscription-offers", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
          is_enabled:
            queryInput.status === PlanOfferAdminStatus.ENABLED
              ? true
              : queryInput.status === PlanOfferAdminStatus.DISABLED
                ? false
                : undefined,
          scope: queryInput.scope,
          frequency: queryInput.frequency,
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
  });
}
