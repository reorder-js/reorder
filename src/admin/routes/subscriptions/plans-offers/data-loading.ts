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
import { HttpTypes } from "@medusajs/framework/types";

type UseAdminPlanOffersDisplayQueryInput = {
  pagination: DataTablePaginationState;
  search: string;
  filtering: DataTableFilteringState;
  sorting: DataTableSortingState | null;
};

export const adminPlanOffersQueryKeys = {
  all: ["admin-plan-offers"] as const,
  productSelection: (params: {
    pageSize: number;
    offset: number;
    search: string;
  }) =>
    [
      ...adminPlanOffersQueryKeys.all,
      "product-selection",
      params.pageSize,
      params.offset,
      params.search,
    ] as const,
  variantSelection: (productId: string) =>
    [...adminPlanOffersQueryKeys.all, "variant-selection", productId] as const,
  display: (params: {
    pageSize: number;
    offset: number;
    search: string;
    status?: PlanOfferAdminStatus;
    scope?: PlanOfferScope;
    frequency?: PlanOfferFrequencyInterval;
    productId?: string;
    variantId?: string;
    discountMin?: number;
    discountMax?: number;
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
      params.productId,
      params.variantId,
      params.discountMin,
      params.discountMax,
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
  const productId =
    typeof input.filtering.product_id === "string"
      ? input.filtering.product_id
      : undefined;
  const variantId =
    typeof input.filtering.variant_id === "string"
      ? input.filtering.variant_id
      : undefined;
  const discountMin =
    typeof input.filtering.discount_min === "number"
      ? input.filtering.discount_min
      : undefined;
  const discountMax =
    typeof input.filtering.discount_max === "number"
      ? input.filtering.discount_max
      : undefined;

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
    scope,
    frequency,
    productId,
    variantId,
    discountMin,
    discountMax,
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
          product_id: queryInput.productId,
          variant_id: queryInput.variantId,
          discount_min: queryInput.discountMin,
          discount_max: queryInput.discountMax,
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

type UseAdminProductsSelectionQueryInput = {
  open: boolean;
  pagination: DataTablePaginationState;
  search: string;
};

export function useAdminProductsSelectionQuery(
  input: UseAdminProductsSelectionQueryInput
) {
  const limit = input.pagination.pageSize;
  const offset = input.pagination.pageIndex * limit;

  return useQuery<HttpTypes.AdminProductListResponse>({
    queryKey: adminPlanOffersQueryKeys.productSelection({
      pageSize: limit,
      offset,
      search: input.search,
    }),
    queryFn: () =>
      sdk.admin.product.list({
        limit,
        offset,
        q: input.search || undefined,
      }),
    enabled: input.open,
    placeholderData: keepPreviousData,
  });
}

export function useAdminProductVariantsSelectionQuery(
  productId?: string,
  open = false
) {
  return useQuery<HttpTypes.AdminProductVariantListResponse>({
    queryKey: adminPlanOffersQueryKeys.variantSelection(productId ?? ""),
    queryFn: () =>
      sdk.admin.product.listVariants(productId!, {
        limit: 100,
        offset: 0,
      }),
    enabled: open && Boolean(productId),
  });
}
