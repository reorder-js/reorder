import { defineRouteConfig } from "@medusajs/admin-sdk"
import { XMarkMini } from "@medusajs/icons"
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
} from "@medusajs/ui"
import { flexRender } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  DunningCaseAdminListItem,
  DunningCaseAdminStatus,
} from "../../../types/dunning"
import { useAdminDunningDisplayQuery } from "./data-loading"

const PAGE_SIZE = 20

const columnHelper = createDataTableColumnHelper<DunningCaseAdminListItem>()

const statusFilterOptions = [
  { label: "Open", value: DunningCaseAdminStatus.OPEN },
  { label: "Retry scheduled", value: DunningCaseAdminStatus.RETRY_SCHEDULED },
  { label: "Retrying", value: DunningCaseAdminStatus.RETRYING },
  {
    label: "Awaiting manual resolution",
    value: DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION,
  },
  { label: "Recovered", value: DunningCaseAdminStatus.RECOVERED },
  { label: "Unrecovered", value: DunningCaseAdminStatus.UNRECOVERED },
] as const

const baseColumns = [
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
          {[
            row.original.subscription.product_title,
            row.original.subscription.variant_title,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableSorting: true,
    sortLabel: "Status",
    cell: ({ getValue }) => (
      <StatusBadge color={getStatusColor(getValue())} className="text-nowrap">
        {formatStatus(getValue())}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("next_retry_at", {
    header: "Next retry",
    enableSorting: true,
    sortLabel: "Next retry",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {formatDateTime(getValue())}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {formatRetryWindow(row.original)}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("attempt_count", {
    header: "Attempts",
    enableSorting: true,
    sortLabel: "Attempts",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.attempt_count} / {row.original.max_attempts}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.last_attempt_at
            ? `Last attempt ${formatDateTime(row.original.last_attempt_at)}`
            : "No retry attempts yet"}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("last_payment_error_code", {
    header: "Last error",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.last_payment_error_code || "No payment error code"}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.subscription.payment_provider_id || "Unknown provider"}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("renewal.renewal_cycle_id", {
    id: "renewal_order",
    header: "Renewal / Order",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-0.5">
        {row.original.renewal ? (
          <Link
            to={`/subscriptions/renewals/${row.original.renewal.renewal_cycle_id}`}
            className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            Renewal {row.original.renewal.renewal_cycle_id}
          </Link>
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            No linked renewal
          </Text>
        )}
        {row.original.order ? (
          <Link
            to={`/orders/${row.original.order.order_id}`}
            className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            Order #{row.original.order.display_id}
          </Link>
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            No linked order
          </Text>
        )}
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
]

const DunningPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [filtering, setFiltering] = useState<DataTableFilteringState>({})
  const [sorting, setSorting] = useState<DataTableSortingState | null>({
    id: "updated_at",
    desc: true,
  })
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })

  const statusFilterValue = useMemo(() => {
    return Array.isArray(filtering.status)
      ? (filtering.status as DunningCaseAdminStatus[])
      : []
  }, [filtering])
  const paymentProviderValue = useMemo(() => {
    return typeof filtering.payment_provider_id === "string"
      ? filtering.payment_provider_id
      : ""
  }, [filtering])
  const errorCodeValue = useMemo(() => {
    return typeof filtering.last_payment_error_code === "string"
      ? filtering.last_payment_error_code
      : ""
  }, [filtering])
  const attemptCountMinValue = useMemo(() => {
    return typeof filtering.attempt_count_min === "string"
      ? filtering.attempt_count_min
      : typeof filtering.attempt_count_min === "number"
        ? filtering.attempt_count_min.toString()
        : ""
  }, [filtering])
  const attemptCountMaxValue = useMemo(() => {
    return typeof filtering.attempt_count_max === "string"
      ? filtering.attempt_count_max
      : typeof filtering.attempt_count_max === "number"
        ? filtering.attempt_count_max.toString()
        : ""
  }, [filtering])
  const nextRetryFromValue = useMemo(() => {
    return typeof filtering.next_retry_from === "string"
      ? filtering.next_retry_from
      : ""
  }, [filtering])
  const nextRetryToValue = useMemo(() => {
    return typeof filtering.next_retry_to === "string"
      ? filtering.next_retry_to
      : ""
  }, [filtering])

  const { data, isLoading, isError, error } = useAdminDunningDisplayQuery({
    pagination,
    search,
    filtering,
    sorting,
  })

  const table = useDataTable({
    columns: baseColumns,
    data: data?.dunning_cases || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    onRowClick: (_event, row) => {
      navigate(`/subscriptions/dunning/${row.id}`)
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
  })

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-x-4">
            <div className="flex flex-col">
              <Heading level="h1">Dunning</Heading>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                Monitor past-due subscriptions, retry timing, and recovery state.
              </Text>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error ? error.message : "Failed to load dunning cases."}
          </Alert>
        </div>
      </Container>
    )
  }

  const hasActiveFilters =
    statusFilterValue.length > 0 ||
    Boolean(paymentProviderValue) ||
    Boolean(errorCodeValue) ||
    Boolean(attemptCountMinValue) ||
    Boolean(attemptCountMaxValue) ||
    Boolean(nextRetryFromValue) ||
    Boolean(nextRetryToValue)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col">
          <Heading level="h1">Dunning</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Monitor past-due subscriptions, retry timing, and recovery state.
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
                value={formatStatus(status)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    status: statusFilterValue.filter((value) => value !== status),
                  }))
                }}
              />
            ))}
            {paymentProviderValue ? (
              <FilterChip
                label="Provider"
                value={paymentProviderValue}
                onRemove={() => {
                  setFiltering((current) =>
                    removeFilter(current, "payment_provider_id")
                  )
                }}
              />
            ) : null}
            {errorCodeValue ? (
              <FilterChip
                label="Error code"
                value={errorCodeValue}
                onRemove={() => {
                  setFiltering((current) =>
                    removeFilter(current, "last_payment_error_code")
                  )
                }}
              />
            ) : null}
            {attemptCountMinValue || attemptCountMaxValue ? (
              <FilterChip
                label="Attempt count"
                value={formatAttemptRange(
                  attemptCountMinValue,
                  attemptCountMaxValue
                )}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...removeFilter(current, "attempt_count_min"),
                    attempt_count_max: undefined,
                  }))
                }}
              />
            ) : null}
            {nextRetryFromValue || nextRetryToValue ? (
              <FilterChip
                label="Next retry"
                value={formatDateRange(nextRetryFromValue, nextRetryToValue)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...removeFilter(current, "next_retry_from"),
                    next_retry_to: undefined,
                  }))
                }}
              />
            ) : null}
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
                          event.preventDefault()
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            status: checked
                              ? [...statusFilterValue, option.value]
                              : statusFilterValue.filter(
                                  (value) => value !== option.value
                                ),
                          }))
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
              <Button
                size="small"
                variant="transparent"
                type="button"
                onClick={() => {
                  setFiltering({})
                }}
              >
                Clear all
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Input
              type="text"
              size="small"
              placeholder="Provider id"
              value={paymentProviderValue}
              onChange={(event) => {
                setFiltering((current) => ({
                  ...current,
                  payment_provider_id: event.target.value,
                }))
              }}
            />
            <Input
              type="text"
              size="small"
              placeholder="Error code"
              value={errorCodeValue}
              onChange={(event) => {
                setFiltering((current) => ({
                  ...current,
                  last_payment_error_code: event.target.value,
                }))
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                min={0}
                size="small"
                placeholder="Attempts min"
                value={attemptCountMinValue}
                onChange={(event) => {
                  setFiltering((current) => ({
                    ...current,
                    attempt_count_min: event.target.value,
                  }))
                }}
              />
              <Input
                type="number"
                min={0}
                size="small"
                placeholder="Attempts max"
                value={attemptCountMaxValue}
                onChange={(event) => {
                  setFiltering((current) => ({
                    ...current,
                    attempt_count_max: event.target.value,
                  }))
                }}
              />
            </div>
            <Input
              type="datetime-local"
              size="small"
              placeholder="Next retry from"
              value={nextRetryFromValue}
              onChange={(event) => {
                setFiltering((current) => ({
                  ...current,
                  next_retry_from: event.target.value,
                }))
              }}
            />
            <Input
              type="datetime-local"
              size="small"
              placeholder="Next retry to"
              value={nextRetryToValue}
              onChange={(event) => {
                setFiltering((current) => ({
                  ...current,
                  next_retry_to: event.target.value,
                }))
              }}
            />
          </div>
          <div className="flex items-center gap-x-2 self-end">
            <div className="w-full md:w-auto">
              <DataTable.Search placeholder="Search" />
            </div>
            <DataTable.SortingMenu />
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
                      const canSort = header.column.getCanSort()
                      const sortHandler = header.column.getToggleSortingHandler()

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
                      )
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
                      event.preventDefault()
                      navigate(`/subscriptions/dunning/${row.id}`)
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
                ? "No matching dunning cases"
                : "No dunning cases yet"}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {hasActiveFilters || search
                ? "Try changing the search term or active filters."
                : "Dunning cases will appear here after failed renewal payments enter the recovery flow."}
            </Text>
          </div>
        )}
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Dunning",
  rank: 3,
})

export const handle = {
  breadcrumb: () => "Dunning",
}

export default DunningPage

const FilterChip = ({
  label,
  value,
  onRemove,
}: {
  label: string
  value: string
  onRemove: () => void
}) => {
  return (
    <div className="bg-ui-bg-subtle text-ui-fg-subtle inline-flex items-center gap-x-1 rounded-md px-2 py-1">
      <Text size="xsmall" leading="compact" weight="plus">
        {label}:
      </Text>
      <Text size="xsmall" leading="compact">
        {value}
      </Text>
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        className="text-ui-fg-muted hover:text-ui-fg-subtle"
        onClick={onRemove}
      >
        <XMarkMini />
      </button>
    </div>
  )
}

function removeFilter(
  current: DataTableFilteringState,
  key: string
): DataTableFilteringState {
  const next = { ...current }
  delete next[key]
  return next
}

function formatStatus(status: DunningCaseAdminStatus) {
  switch (status) {
    case DunningCaseAdminStatus.OPEN:
      return "Open"
    case DunningCaseAdminStatus.RETRY_SCHEDULED:
      return "Retry scheduled"
    case DunningCaseAdminStatus.RETRYING:
      return "Retrying"
    case DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION:
      return "Awaiting manual resolution"
    case DunningCaseAdminStatus.RECOVERED:
      return "Recovered"
    case DunningCaseAdminStatus.UNRECOVERED:
      return "Unrecovered"
  }
}

function getStatusColor(status: DunningCaseAdminStatus) {
  switch (status) {
    case DunningCaseAdminStatus.OPEN:
      return "orange"
    case DunningCaseAdminStatus.RETRY_SCHEDULED:
      return "orange"
    case DunningCaseAdminStatus.RETRYING:
      return "blue"
    case DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION:
      return "grey"
    case DunningCaseAdminStatus.RECOVERED:
      return "green"
    case DunningCaseAdminStatus.UNRECOVERED:
      return "red"
  }
}

function formatRetryWindow(item: DunningCaseAdminListItem) {
  if (item.status === DunningCaseAdminStatus.RECOVERED) {
    return "Recovered"
  }

  if (item.status === DunningCaseAdminStatus.UNRECOVERED) {
    return "Closed as unrecovered"
  }

  if (item.status === DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION) {
    return "Waiting for manual resolution"
  }

  if (!item.next_retry_at) {
    return "No retry scheduled"
  }

  return "Queued for retry"
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatAttemptRange(min?: string, max?: string) {
  if (min && max) {
    return `${min}-${max}`
  }

  if (min) {
    return `${min}+`
  }

  if (max) {
    return `Up to ${max}`
  }

  return "-"
}

function formatDateRange(from?: string, to?: string) {
  const formattedFrom = formatDateTime(from)
  const formattedTo = formatDateTime(to)

  if (from && to) {
    return `${formattedFrom} to ${formattedTo}`
  }

  if (from) {
    return `From ${formattedFrom}`
  }

  if (to) {
    return `Until ${formattedTo}`
  }

  return "-"
}
