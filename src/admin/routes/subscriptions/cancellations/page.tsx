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
import { useNavigate } from "react-router-dom"
import {
  CancellationCaseAdminListItem,
  CancellationFinalOutcomeAdmin,
} from "../../../types/cancellation"
import { useAdminCancellationsDisplayQuery } from "./data-loading"

const PAGE_SIZE = 20
const DEFAULT_CREATED_FROM = toLocalDateTimeInputValue(
  startOfDay(addDays(new Date(), -30))
)
const DEFAULT_CREATED_TO = toLocalDateTimeInputValue(
  startOfDay(addDays(new Date(), 30))
)

const columnHelper =
  createDataTableColumnHelper<CancellationCaseAdminListItem>()

const reasonCategoryFilterOptions = [
  { label: "Price", value: "price" },
  { label: "Product fit", value: "product_fit" },
  { label: "Delivery", value: "delivery" },
  { label: "Billing", value: "billing" },
  { label: "Temporary pause", value: "temporary_pause" },
  { label: "Switched competitor", value: "switched_competitor" },
  { label: "Other", value: "other" },
] as const

const finalOutcomeFilterOptions = [
  { label: "Retained", value: CancellationFinalOutcomeAdmin.RETAINED },
  { label: "Paused", value: CancellationFinalOutcomeAdmin.PAUSED },
  { label: "Canceled", value: CancellationFinalOutcomeAdmin.CANCELED },
] as const

const offerTypeFilterOptions = [
  { label: "Pause offer", value: "pause_offer" },
  { label: "Discount offer", value: "discount_offer" },
  { label: "Bonus offer", value: "bonus_offer" },
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
  columnHelper.accessor("reason_category", {
    header: "Reason category",
    enableSorting: true,
    sortLabel: "Reason category",
    cell: ({ getValue }) => (
      <StatusBadge color="grey" className="text-nowrap">
        {formatReasonCategory(getValue())}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("final_outcome", {
    header: "Outcome",
    enableSorting: true,
    sortLabel: "Outcome",
    cell: ({ row }) => (
      <StatusBadge color={getOutcomeColor(row.original)} className="text-nowrap">
        {formatOutcome(row.original)}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("created_at", {
    header: "Created",
    enableSorting: true,
    sortLabel: "Created",
    cell: ({ getValue }) => (
      <Text size="small" leading="compact">
        {formatDateTime(getValue())}
      </Text>
    ),
  }),
]

const CancellationsPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [filtering, setFiltering] = useState<DataTableFilteringState>(() => ({
    created_from: DEFAULT_CREATED_FROM,
    created_to: DEFAULT_CREATED_TO,
  }))
  const [sorting, setSorting] = useState<DataTableSortingState | null>({
    id: "created_at",
    desc: true,
  })
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })

  const reasonCategoryFilters = useMemo(
    () =>
      Array.isArray(filtering.reason_category)
        ? (filtering.reason_category as string[])
        : [],
    [filtering]
  )
  const finalOutcomeFilters = useMemo(
    () =>
      Array.isArray(filtering.final_outcome)
        ? (filtering.final_outcome as CancellationFinalOutcomeAdmin[])
        : [],
    [filtering]
  )
  const offerTypeFilters = useMemo(
    () =>
      Array.isArray(filtering.offer_type)
        ? (filtering.offer_type as Array<"pause_offer" | "discount_offer" | "bonus_offer">)
        : [],
    [filtering]
  )
  const createdFromValue = useMemo(() => {
    return typeof filtering.created_from === "string" ? filtering.created_from : ""
  }, [filtering])
  const createdToValue = useMemo(() => {
    return typeof filtering.created_to === "string" ? filtering.created_to : ""
  }, [filtering])

  const { data, isLoading, isError, error } = useAdminCancellationsDisplayQuery({
    pagination,
    search,
    filtering,
    sorting,
  })

  const table = useDataTable({
    columns: baseColumns,
    data: data?.cancellations || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    onRowClick: (_event, row) => {
      navigate(`/subscriptions/cancellations/${row.id}`)
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
              <Heading level="h1">Cancellation &amp; Retention</Heading>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            <Text size="small" leading="compact">
              {error instanceof Error
                ? error.message
                : "Failed to load cancellation cases."}
            </Text>
          </Alert>
        </div>
      </Container>
    )
  }

  const hasActiveFilters =
    reasonCategoryFilters.length ||
    finalOutcomeFilters.length ||
    offerTypeFilters.length ||
    Boolean(createdFromValue) ||
    Boolean(createdToValue)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-x-4">
          <div className="flex flex-col">
            <Heading level="h1">Cancellation &amp; Retention</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Review cancellation cases, churn reasons, and retention outcomes.
            </Text>
          </div>
        </div>
      </div>

      <DataTable instance={table}>
        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {reasonCategoryFilters.map((reasonCategory) => (
              <FilterChip
                key={reasonCategory}
                label="Reason category"
                value={formatReasonCategory(reasonCategory)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    reason_category: reasonCategoryFilters.filter(
                      (value) => value !== reasonCategory
                    ),
                  }))
                }}
              />
            ))}
            {finalOutcomeFilters.map((finalOutcome) => (
              <FilterChip
                key={finalOutcome}
                label="Outcome"
                value={formatFinalOutcomeFilter(finalOutcome)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    final_outcome: finalOutcomeFilters.filter(
                      (value) => value !== finalOutcome
                    ),
                  }))
                }}
              />
            ))}
            {offerTypeFilters.map((offerType) => (
              <FilterChip
                key={offerType}
                label="Offer type"
                value={formatOfferTypeFilter(offerType)}
                onRemove={() => {
                  setFiltering((current) => ({
                    ...current,
                    offer_type: offerTypeFilters.filter(
                      (value) => value !== offerType
                    ),
                  }))
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
                  <DropdownMenu.SubMenuTrigger>
                    Reason category
                  </DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {reasonCategoryFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={reasonCategoryFilters.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault()
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            reason_category: checked
                              ? [...reasonCategoryFilters, option.value]
                              : reasonCategoryFilters.filter(
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
                <DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenuTrigger>Outcome</DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {finalOutcomeFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={finalOutcomeFilters.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault()
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            final_outcome: checked
                              ? [...finalOutcomeFilters, option.value]
                              : finalOutcomeFilters.filter(
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
                <DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenuTrigger>Offer type</DropdownMenu.SubMenuTrigger>
                  <DropdownMenu.SubMenuContent>
                    {offerTypeFilterOptions.map((option) => (
                      <DropdownMenu.CheckboxItem
                        key={option.value}
                        checked={offerTypeFilters.includes(option.value)}
                        onSelect={(event) => {
                          event.preventDefault()
                        }}
                        onCheckedChange={(checked) => {
                          setFiltering((current) => ({
                            ...current,
                            offer_type: checked
                              ? [...offerTypeFilters, option.value]
                              : offerTypeFilters.filter(
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
              <button
                type="button"
                className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small-plus rounded-md px-2 py-1 transition-fg"
                onClick={() =>
                  setFiltering({
                    created_from: DEFAULT_CREATED_FROM,
                    created_to: DEFAULT_CREATED_TO,
                  })
                }
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-y-1">
                <Text size="small" leading="compact" weight="plus">
                  Created from
                </Text>
                <Input
                  type="datetime-local"
                  size="small"
                  value={createdFromValue}
                  onChange={(event) => {
                    const value = event.target.value

                    setFiltering((current) =>
                      value
                        ? { ...current, created_from: value }
                        : removeFilter(current, "created_from")
                    )
                  }}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Text size="small" leading="compact" weight="plus">
                  Created to
                </Text>
                <Input
                  type="datetime-local"
                  size="small"
                  value={createdToValue}
                  onChange={(event) => {
                    const value = event.target.value

                    setFiltering((current) =>
                      value
                        ? { ...current, created_to: value }
                        : removeFilter(current, "created_to")
                    )
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
                      navigate(`/subscriptions/cancellations/${row.id}`)
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
              No cancellation cases
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No cancellation and retention cases match the current filters.
            </Text>
          </div>
        )}
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Cancellation & Retention",
  rank: 4,
})

export const handle = {
  breadcrumb: () => "Cancellation & Retention",
}

export default CancellationsPage

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
  )
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

function toLocalDateTimeInputValue(date: Date) {
  const next = new Date(date)
  next.setSeconds(0, 0)

  const year = next.getFullYear()
  const month = String(next.getMonth() + 1).padStart(2, "0")
  const day = String(next.getDate()).padStart(2, "0")
  const hours = String(next.getHours()).padStart(2, "0")
  const minutes = String(next.getMinutes()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function removeFilter(current: DataTableFilteringState, key: string) {
  const { [key]: _removed, ...rest } = current
  return rest
}

function formatReasonCategory(value: string | null) {
  if (!value) {
    return "Unclassified"
  }

  switch (value) {
    case "product_fit":
      return "Product fit"
    case "temporary_pause":
      return "Temporary pause"
    case "switched_competitor":
      return "Switched competitor"
    default:
      return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
  }
}

function formatFinalOutcomeFilter(value: CancellationFinalOutcomeAdmin) {
  switch (value) {
    case CancellationFinalOutcomeAdmin.RETAINED:
      return "Retained"
    case CancellationFinalOutcomeAdmin.PAUSED:
      return "Paused"
    case CancellationFinalOutcomeAdmin.CANCELED:
      return "Canceled"
  }
}

function formatOfferTypeFilter(
  value: "pause_offer" | "discount_offer" | "bonus_offer"
) {
  switch (value) {
    case "pause_offer":
      return "Pause offer"
    case "discount_offer":
      return "Discount offer"
    case "bonus_offer":
      return "Bonus offer"
  }
}

function formatOutcome(item: CancellationCaseAdminListItem) {
  if (item.final_outcome) {
    switch (item.final_outcome) {
      case CancellationFinalOutcomeAdmin.RETAINED:
        return "Retained"
      case CancellationFinalOutcomeAdmin.PAUSED:
        return "Paused"
      case CancellationFinalOutcomeAdmin.CANCELED:
        return "Canceled"
    }
  }

  switch (item.status) {
    case "requested":
      return "Requested"
    case "evaluating_retention":
      return "Evaluating"
    case "retention_offered":
      return "Retention offered"
    case "retained":
      return "Retained"
    case "paused":
      return "Paused"
    case "canceled":
      return "Canceled"
    default:
      return item.status
  }
}

function getOutcomeColor(item: CancellationCaseAdminListItem) {
  if (item.final_outcome === CancellationFinalOutcomeAdmin.RETAINED) {
    return "green"
  }

  if (item.final_outcome === CancellationFinalOutcomeAdmin.PAUSED) {
    return "orange"
  }

  if (item.final_outcome === CancellationFinalOutcomeAdmin.CANCELED) {
    return "red"
  }

  switch (item.status) {
    case "requested":
      return "grey"
    case "evaluating_retention":
      return "blue"
    case "retention_offered":
      return "orange"
    case "retained":
      return "green"
    case "paused":
      return "orange"
    case "canceled":
      return "red"
    default:
      return "grey"
  }
}
