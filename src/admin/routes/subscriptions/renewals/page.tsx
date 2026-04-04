import { defineRouteConfig } from "@medusajs/admin-sdk";
import { XMarkMini } from "@medusajs/icons";
import {
  Alert,
  Button,
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
  DropdownMenu,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  useDataTable,
} from "@medusajs/ui";
import { flexRender } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RenewalAdminApprovalSummary,
  RenewalApprovalStatus,
  RenewalAttemptAdminStatus,
  RenewalCycleAdminListItem,
  RenewalCycleAdminStatus,
} from "../../../types/renewal";
import { useAdminRenewalsDisplayQuery } from "./data-loading";

const PAGE_SIZE = 20;

const columnHelper = createDataTableColumnHelper<RenewalCycleAdminListItem>();

const statusFilterOptions = [
  { label: "Scheduled", value: RenewalCycleAdminStatus.SCHEDULED },
  { label: "Processing", value: RenewalCycleAdminStatus.PROCESSING },
  { label: "Succeeded", value: RenewalCycleAdminStatus.SUCCEEDED },
  { label: "Failed", value: RenewalCycleAdminStatus.FAILED },
] as const;

const approvalFilterOptions = [
  { label: "Pending", value: RenewalApprovalStatus.PENDING },
  { label: "Approved", value: RenewalApprovalStatus.APPROVED },
  { label: "Rejected", value: RenewalApprovalStatus.REJECTED },
] as const;

const attemptFilterOptions = [
  { label: "Processing", value: RenewalAttemptAdminStatus.PROCESSING },
  { label: "Succeeded", value: RenewalAttemptAdminStatus.SUCCEEDED },
  { label: "Failed", value: RenewalAttemptAdminStatus.FAILED },
] as const;

const baseColumns = [
  columnHelper.accessor("scheduled_for", {
    header: "Scheduled",
    enableSorting: true,
    sortLabel: "Scheduled",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {formatDateTime(getValue())}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {formatRelativeCycleStatus(row.original.status)}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("subscription.reference", {
    id: "subscription_reference",
    header: "Subscription",
    enableSorting: true,
    sortLabel: "Subscription",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-0.5">
        <Text size="small" leading="compact" weight="plus">
          {row.original.subscription.reference}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.subscription.customer_name}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {formatSubscriptionContext(row.original)}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableSorting: true,
    sortLabel: "Status",
    cell: ({ getValue }) => (
      <StatusBadge color={getCycleStatusColor(getValue())} className="text-nowrap">
        {formatCycleStatus(getValue())}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("approval.status", {
    id: "approval_status",
    header: "Approval",
    enableSorting: true,
    sortLabel: "Approval",
    cell: ({ row }) => (
      <StatusBadge
        color={getApprovalStatusColor(row.original.approval)}
        className="text-nowrap"
      >
        {formatApprovalStatus(row.original.approval)}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("last_attempt_status", {
    header: "Last attempt",
    enableSorting: true,
    sortLabel: "Last attempt",
    cell: ({ row }) => {
      if (!row.original.last_attempt_status) {
        return (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            No attempts yet
          </Text>
        );
      }

      return (
        <div className="flex flex-col">
          <StatusBadge
            color={getAttemptStatusColor(row.original.last_attempt_status)}
            className="text-nowrap"
          >
            {formatAttemptStatus(row.original.last_attempt_status)}
          </StatusBadge>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {formatDateTime(row.original.last_attempt_at)}
          </Text>
        </div>
      );
    },
  }),
];

const RenewalsPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState<DataTableFilteringState>(() => ({
    scheduled_from: toLocalDateTimeInputValue(startOfDay(addDays(new Date(), -30))),
    scheduled_to: toLocalDateTimeInputValue(startOfDay(addDays(new Date(), 30))),
  }));
  const [sorting, setSorting] = useState<DataTableSortingState | null>({
    id: "scheduled_for",
    desc: true,
  });
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const statusFilterValue = useMemo(() => {
    return Array.isArray(filtering.status)
      ? (filtering.status as RenewalCycleAdminStatus[])
      : [];
  }, [filtering]);
  const approvalFilterValue = useMemo(() => {
    return Array.isArray(filtering.approval_status)
      ? (filtering.approval_status as RenewalApprovalStatus[])
      : [];
  }, [filtering]);
  const lastAttemptFilterValue = useMemo(() => {
    return Array.isArray(filtering.last_attempt_status)
      ? (filtering.last_attempt_status as RenewalAttemptAdminStatus[])
      : [];
  }, [filtering]);
  const scheduledFromValue = useMemo(() => {
    return typeof filtering.scheduled_from === "string"
      ? filtering.scheduled_from
      : "";
  }, [filtering]);
  const scheduledToValue = useMemo(() => {
    return typeof filtering.scheduled_to === "string"
      ? filtering.scheduled_to
      : "";
  }, [filtering]);

  const { data, isLoading, isError, error } = useAdminRenewalsDisplayQuery({
    pagination,
    search,
    filtering,
    sorting,
  });

  const table = useDataTable({
    columns: baseColumns,
    data: data?.renewals || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    onRowClick: (_event, row) => {
      navigate(`/subscriptions/renewals/${row.id}`);
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
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-x-4">
            <div className="flex flex-col">
              <Heading level="h1">Renewals</Heading>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                Monitor scheduled subscription renewal cycles and their latest
                execution state.
              </Text>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error ? error.message : "Failed to load renewals."}
          </Alert>
        </div>
      </Container>
    );
  }

  const hasActiveFilters =
    statusFilterValue.length > 0 ||
    approvalFilterValue.length > 0 ||
    lastAttemptFilterValue.length > 0 ||
    Boolean(scheduledFromValue) ||
    Boolean(scheduledToValue);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col">
          <Heading level="h1">Renewals</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Monitor scheduled subscription renewal cycles and their latest
            execution state.
          </Text>
        </div>
      </div>
      <DataTable instance={table}>
        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {statusFilterValue.map((status) => (
              <FilterChip
                key={status}
                label="Status"
                value={formatCycleStatus(status)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    status: statusFilterValue.filter((value) => value !== status),
                  }));
                }}
              />
            ))}
            {approvalFilterValue.map((status) => (
              <FilterChip
                key={status}
                label="Approval"
                value={formatApprovalFilterStatus(status)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    approval_status: approvalFilterValue.filter(
                      (value) => value !== status
                    ),
                  }));
                }}
              />
            ))}
            {lastAttemptFilterValue.map((status) => (
              <FilterChip
                key={status}
                label="Last attempt"
                value={formatAttemptStatus(status)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    last_attempt_status: lastAttemptFilterValue.filter(
                      (value) => value !== status
                    ),
                  }));
                }}
              />
            ))}
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button size="small" variant="secondary" type="button">
                  Add filter
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start">
                <DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenuTrigger>Status</DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {statusFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={statusFilterValue.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault();
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            status: checked
                              ? [...statusFilterValue, option.value]
                              : statusFilterValue.filter(
                                  (value) => value !== option.value
                                ),
                          }));
                        }}
                      >
                        {option.label}
                      </DropdownMenu.CheckboxItem>
                    ))}
                  </DropdownMenu.SubMenuContent>
                </DropdownMenu.SubMenu>
                <DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenuTrigger>
                    Approval status
                  </DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {approvalFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={approvalFilterValue.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault();
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            approval_status: checked
                              ? [...approvalFilterValue, option.value]
                              : approvalFilterValue.filter(
                                  (value) => value !== option.value
                                ),
                          }));
                        }}
                      >
                        {option.label}
                      </DropdownMenu.CheckboxItem>
                    ))}
                  </DropdownMenu.SubMenuContent>
                </DropdownMenu.SubMenu>
                <DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenuTrigger>
                    Last attempt result
                  </DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {attemptFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={lastAttemptFilterValue.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault();
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            last_attempt_status: checked
                              ? [...lastAttemptFilterValue, option.value]
                              : lastAttemptFilterValue.filter(
                                  (value) => value !== option.value
                                ),
                          }));
                        }}
                      >
                        {option.label}
                      </DropdownMenu.CheckboxItem>
                    ))}
                  </DropdownMenu.SubMenuContent>
                </DropdownMenu.SubMenu>
              </DropdownMenu.Content>
            </DropdownMenu>
            {hasActiveFilters ? (
              <button
                type="button"
                className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small-plus rounded-md px-2 py-1 transition-fg"
                onClick={() => {
                  setFiltering({});
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-y-1">
                <Text size="small" leading="compact" weight="plus">
                  Scheduled from
                </Text>
                <Input
                  type="datetime-local"
                  size="small"
                  value={scheduledFromValue}
                  onChange={(event) => {
                    const value = event.target.value;

                    setFiltering((current) =>
                      value
                        ? { ...current, scheduled_from: value }
                        : removeFilter(current, "scheduled_from")
                    );
                  }}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Text size="small" leading="compact" weight="plus">
                  Scheduled to
                </Text>
                <Input
                  type="datetime-local"
                  size="small"
                  value={scheduledToValue}
                  onChange={(event) => {
                    const value = event.target.value;

                    setFiltering((current) =>
                      value
                        ? { ...current, scheduled_to: value }
                        : removeFilter(current, "scheduled_to")
                    );
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-x-2 self-end">
              <div className="w-full md:w-auto">
                <DataTable.Search placeholder="Search" />
              </div>
              <DataTable.SortingMenu />
            </div>
          </div>
        </div>
        {table.getRowModel().rows.length ? (
          <div className="overflow-x-auto border-y">
            <Table className="relative isolate w-full">
              <Table.Header className="border-t-0">
                {table.getHeaderGroups().map((headerGroup) => (
                  <Table.Row
                    key={headerGroup.id}
                    className="border-b-0 [&_th:last-of-type]:w-[1%] [&_th:last-of-type]:whitespace-nowrap"
                  >
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sortHandler = header.column.getToggleSortingHandler();

                      return (
                        <Table.HeaderCell
                          key={header.id}
                          className="whitespace-nowrap"
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={sortHandler}
                              className="group flex items-center gap-2 text-left"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )
                          )}
                        </Table.HeaderCell>
                      );
                    })}
                  </Table.Row>
                ))}
              </Table.Header>
              <Table.Body className="border-b-0">
                {table.getRowModel().rows.map((row) => (
                  <Table.Row
                    key={row.id}
                    className="group/row cursor-pointer"
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(`/subscriptions/renewals/${row.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell
                        key={cell.id}
                        className="items-stretch truncate whitespace-nowrap"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : (
          <div className="flex min-h-[250px] w-full flex-col items-center justify-center border-y px-6 py-4 text-center">
            <Text size="base" weight="plus">
              {hasActiveFilters || search
                ? "No matching renewal cycles"
                : "No renewal cycles yet"}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {hasActiveFilters || search
                ? "Try changing the search term or active filters."
                : "Renewal cycles will appear here once subscriptions are scheduled for processing."}
            </Text>
          </div>
        )}
        <DataTable.Pagination />
      </DataTable>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Renewals",
  rank: 2,
});

export const handle = {
  breadcrumb: () => "Renewals",
};

export default RenewalsPage;

const FilterChip = ({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) => {
  return (
    <div className="shadow-buttons-neutral txt-compact-small-plus bg-ui-button-neutral text-ui-fg-base inline-flex items-center overflow-hidden rounded-md">
      <span className="border-ui-border-base border-r px-3 py-1.5">{label}</span>
      <span className="border-ui-border-base border-r px-3 py-1.5 text-ui-fg-subtle">
        is
      </span>
      <span className="border-ui-border-base border-r px-3 py-1.5">{value}</span>
      <button
        type="button"
        className="hover:bg-ui-button-neutral-hover px-2 py-1.5 transition-fg"
        onClick={onRemove}
      >
        <XMarkMini />
      </button>
    </div>
  );
};

function removeFilter(
  current: DataTableFilteringState,
  key: string
): DataTableFilteringState {
  const { [key]: _removed, ...rest } = current;
  return rest;
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

function formatCycleStatus(status: RenewalCycleAdminStatus) {
  switch (status) {
    case RenewalCycleAdminStatus.SCHEDULED:
      return "Scheduled";
    case RenewalCycleAdminStatus.PROCESSING:
      return "Processing";
    case RenewalCycleAdminStatus.SUCCEEDED:
      return "Succeeded";
    case RenewalCycleAdminStatus.FAILED:
      return "Failed";
  }
}

function formatAttemptStatus(status: RenewalAttemptAdminStatus) {
  switch (status) {
    case RenewalAttemptAdminStatus.PROCESSING:
      return "Processing";
    case RenewalAttemptAdminStatus.SUCCEEDED:
      return "Succeeded";
    case RenewalAttemptAdminStatus.FAILED:
      return "Failed";
  }
}

function formatApprovalFilterStatus(status: RenewalApprovalStatus) {
  switch (status) {
    case RenewalApprovalStatus.PENDING:
      return "Pending";
    case RenewalApprovalStatus.APPROVED:
      return "Approved";
    case RenewalApprovalStatus.REJECTED:
      return "Rejected";
  }
}

function formatApprovalStatus(approval: RenewalAdminApprovalSummary) {
  if (!approval.required || !approval.status) {
    return "Not required";
  }

  switch (approval.status) {
    case RenewalApprovalStatus.PENDING:
      return "Pending approval";
    case RenewalApprovalStatus.APPROVED:
      return "Approved";
    case RenewalApprovalStatus.REJECTED:
      return "Rejected";
  }
}

function formatSubscriptionContext(renewal: RenewalCycleAdminListItem) {
  const parts = [
    renewal.subscription.product_title,
    renewal.subscription.variant_title,
    renewal.subscription.sku,
  ].filter(Boolean);

  return parts.join(" · ");
}

function formatRelativeCycleStatus(status: RenewalCycleAdminStatus) {
  switch (status) {
    case RenewalCycleAdminStatus.SCHEDULED:
      return "Awaiting processing";
    case RenewalCycleAdminStatus.PROCESSING:
      return "Currently processing";
    case RenewalCycleAdminStatus.SUCCEEDED:
      return "Processed";
    case RenewalCycleAdminStatus.FAILED:
      return "Needs review";
  }
}

function getCycleStatusColor(status: RenewalCycleAdminStatus) {
  switch (status) {
    case RenewalCycleAdminStatus.SCHEDULED:
      return "blue";
    case RenewalCycleAdminStatus.PROCESSING:
      return "orange";
    case RenewalCycleAdminStatus.SUCCEEDED:
      return "green";
    case RenewalCycleAdminStatus.FAILED:
      return "red";
  }
}

function getAttemptStatusColor(status: RenewalAttemptAdminStatus) {
  switch (status) {
    case RenewalAttemptAdminStatus.PROCESSING:
      return "orange";
    case RenewalAttemptAdminStatus.SUCCEEDED:
      return "green";
    case RenewalAttemptAdminStatus.FAILED:
      return "red";
  }
}

function getApprovalStatusColor(approval: RenewalAdminApprovalSummary) {
  if (!approval.required || !approval.status) {
    return "grey";
  }

  switch (approval.status) {
    case RenewalApprovalStatus.PENDING:
      return "orange";
    case RenewalApprovalStatus.APPROVED:
      return "green";
    case RenewalApprovalStatus.REJECTED:
      return "red";
  }
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toLocalDateTimeInputValue(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  const hours = String(next.getHours()).padStart(2, "0");
  const minutes = String(next.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
