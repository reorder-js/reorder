import {
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
} from "@medusajs/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { sdk } from "../../../lib/client";
import {
  RenewalApprovalStatus,
  RenewalAttemptAdminStatus,
  RenewalCycleAdminListResponse,
  RenewalCycleAdminStatus,
} from "../../../types/renewal";

type UseAdminRenewalsDisplayQueryInput = {
  pagination: DataTablePaginationState;
  search: string;
  filtering: DataTableFilteringState;
  sorting: DataTableSortingState | null;
};

export const adminRenewalsQueryKeys = {
  all: ["admin-renewals"] as const,
  display: (params: {
    pageSize: number;
    offset: number;
    search: string;
    status: RenewalCycleAdminStatus[];
    approvalStatus: RenewalApprovalStatus[];
    lastAttemptStatus: RenewalAttemptAdminStatus[];
    scheduledFrom?: string;
    scheduledTo?: string;
    sortingId?: string;
    sortingDesc?: boolean;
  }) =>
    [
      ...adminRenewalsQueryKeys.all,
      "display",
      params.pageSize,
      params.offset,
      params.search,
      params.status,
      params.approvalStatus,
      params.lastAttemptStatus,
      params.scheduledFrom,
      params.scheduledTo,
      params.sortingId,
      params.sortingDesc,
    ] as const,
};

export function getAdminRenewalsDisplayQueryInput(
  input: UseAdminRenewalsDisplayQueryInput
) {
  const offset = input.pagination.pageIndex * input.pagination.pageSize;
  const status = Array.isArray(input.filtering.status)
    ? (input.filtering.status as RenewalCycleAdminStatus[])
    : [];
  const approvalStatus = Array.isArray(input.filtering.approval_status)
    ? (input.filtering.approval_status as RenewalApprovalStatus[])
    : [];
  const lastAttemptStatus = Array.isArray(input.filtering.last_attempt_status)
    ? (input.filtering.last_attempt_status as RenewalAttemptAdminStatus[])
    : [];
  const scheduledFrom =
    typeof input.filtering.scheduled_from === "string"
      ? toIsoDateTime(input.filtering.scheduled_from)
      : undefined;
  const scheduledTo =
    typeof input.filtering.scheduled_to === "string"
      ? toIsoDateTime(input.filtering.scheduled_to)
      : undefined;

  return {
    pageSize: input.pagination.pageSize,
    offset,
    search: input.search,
    status,
    approvalStatus,
    lastAttemptStatus,
    scheduledFrom,
    scheduledTo,
    sortingId: input.sorting?.id,
    sortingDesc: input.sorting?.desc,
  };
}

export function useAdminRenewalsDisplayQuery(
  input: UseAdminRenewalsDisplayQueryInput
) {
  const queryInput = getAdminRenewalsDisplayQueryInput(input);

  return useQuery<RenewalCycleAdminListResponse>({
    queryKey: adminRenewalsQueryKeys.display(queryInput),
    queryFn: () =>
      sdk.client.fetch("/admin/renewals", {
        query: {
          limit: queryInput.pageSize,
          offset: queryInput.offset,
          q: queryInput.search || undefined,
          status: queryInput.status.length ? queryInput.status : undefined,
          approval_status: queryInput.approvalStatus.length
            ? queryInput.approvalStatus
            : undefined,
          last_attempt_status: queryInput.lastAttemptStatus.length
            ? queryInput.lastAttemptStatus
            : undefined,
          scheduled_from: queryInput.scheduledFrom,
          scheduled_to: queryInput.scheduledTo,
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

function toIsoDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}
