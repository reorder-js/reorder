import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ListCheckbox } from "@medusajs/icons";
import {
  Badge,
  Container,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
  Heading,
  Text,
  useDataTable,
} from "@medusajs/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { sdk } from "../../lib/client";
import {
  SubscriptionAdminListItem,
  SubscriptionAdminListResponse,
  SubscriptionAdminStatus,
} from "../../types/subscription";

const PAGE_SIZE = 20;

const columnHelper = createDataTableColumnHelper<SubscriptionAdminListItem>();
const filterHelper = createDataTableFilterHelper<SubscriptionAdminListItem>();

const columns = [
  columnHelper.accessor("reference", {
    header: "Reference",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {getValue()}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.id}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.customer.full_name, {
    id: "customer_name",
    header: "Customer",
    enableSorting: true,
    sortLabel: "Customer",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.customer.full_name}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.customer.email}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.product.product_title, {
    id: "product_title",
    header: "Product",
    enableSorting: true,
    sortLabel: "Product",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.product.product_title}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.product.variant_title}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableSorting: true,
    sortLabel: "Status",
    cell: ({ getValue }) => (
      <Badge color={getStatusColor(getValue())} size="xsmall">
        {formatStatus(getValue())}
      </Badge>
    ),
  }),
  columnHelper.accessor("frequency.label", {
    id: "frequency",
    header: "Frequency",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {getValue()}
        </Text>
        {row.original.discount ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {row.original.discount.label}
          </Text>
        ) : null}
      </div>
    ),
  }),
  columnHelper.accessor("next_renewal_at", {
    header: "Next renewal",
    enableSorting: true,
    sortLabel: "Next renewal",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {formatDateTime(getValue())}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.skip_next_cycle ? "Next cycle skipped" : "Scheduled"}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("updated_at", {
    header: "Updated",
    enableSorting: true,
    sortLabel: "Updated",
    cell: ({ getValue }) => (
      <Text size="small" leading="compact">
        {formatDateTime(getValue())}
      </Text>
    ),
  }),
];

const filters = [
  filterHelper.accessor("status", {
    type: "multiselect",
    label: "Status",
    options: [
      { label: "Active", value: SubscriptionAdminStatus.ACTIVE },
      { label: "Paused", value: SubscriptionAdminStatus.PAUSED },
      { label: "Cancelled", value: SubscriptionAdminStatus.CANCELLED },
      { label: "Past due", value: SubscriptionAdminStatus.PAST_DUE },
    ],
  }),
];

const SubscriptionsPage = () => {
  const [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState<DataTableFilteringState>({});
  const [sorting, setSorting] = useState<DataTableSortingState | null>({
    id: "updated_at",
    desc: true,
  });
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const offset = useMemo(
    () => pagination.pageIndex * pagination.pageSize,
    [pagination],
  );

  const statusFilters = useMemo(() => {
    return (filtering.status || []) as SubscriptionAdminStatus[];
  }, [filtering]);

  const { data, isLoading, isError, error } =
    useQuery<SubscriptionAdminListResponse>({
      queryKey: [
        "admin-subscriptions",
        pagination.pageSize,
        offset,
        search,
        statusFilters,
        sorting?.id,
        sorting?.desc,
      ],
      queryFn: () =>
        sdk.client.fetch("/admin/subscriptions", {
          query: {
            limit: pagination.pageSize,
            offset,
            q: search || undefined,
            status: statusFilters.length ? statusFilters : undefined,
            order: sorting?.id,
            direction: sorting ? (sorting.desc ? "desc" : "asc") : undefined,
          },
        }),
      placeholderData: keepPreviousData,
    });

  const table = useDataTable({
    columns,
    data: data?.subscriptions || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    filters,
    filtering: {
      state: filtering,
      onFilteringChange: setFiltering,
    },
    sorting: {
      state: sorting,
      onSortingChange: setSorting,
    },
    search: {
      state: search,
      onSearchChange: setSearch,
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  });

  if (isError) {
    throw error;
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscriptions</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Monitor subscription status, cadence, and upcoming renewals.
          </Text>
        </div>
        <DataTable instance={table}>
          <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 px-6 py-4 md:flex-row md:items-center">
            <div className="flex w-full items-center justify-between gap-2">
              <div />
              <div className="flex items-center gap-x-2">
                <DataTable.FilterMenu />
                <DataTable.SortingMenu />
                <div className="w-full md:w-auto">
                  <DataTable.Search placeholder="Search subscriptions" />
                </div>
              </div>
            </div>
          </DataTable.Toolbar>
          <DataTable.Table
            emptyState={{
              empty: {
                heading: "No subscriptions yet",
                description:
                  "Subscriptions will appear here once customers start recurring orders.",
              },
              filtered: {
                heading: "No matching subscriptions",
                description: "Try changing the search term or active filters.",
              },
            }}
          />
          <DataTable.Pagination />
        </DataTable>
      </Container>
      <Container className="divide-y p-0"></Container>
    </div>
  );
};

function getStatusColor(status: SubscriptionAdminStatus) {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "green";
    case SubscriptionAdminStatus.PAUSED:
      return "orange";
    case SubscriptionAdminStatus.CANCELLED:
      return "red";
    case SubscriptionAdminStatus.PAST_DUE:
      return "grey";
  }
}

function formatStatus(status: SubscriptionAdminStatus) {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "Active";
    case SubscriptionAdminStatus.PAUSED:
      return "Paused";
    case SubscriptionAdminStatus.CANCELLED:
      return "Cancelled";
    case SubscriptionAdminStatus.PAST_DUE:
      return "Past due";
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const config = defineRouteConfig({
  label: "Subscriptions",
  icon: ListCheckbox,
});

export default SubscriptionsPage;
