import { defineRouteConfig } from "@medusajs/admin-sdk"
import { XMarkMini } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  DropdownMenu,
  Heading,
  Input,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  type AnalyticsExportFormat,
  AnalyticsGroupBy,
  AnalyticsMetricKey,
  type AdminAnalyticsFilters,
  type AnalyticsFrequencyFilter,
  type AnalyticsKpiSummary,
  type AnalyticsSubscriptionStatus,
  type AnalyticsTrendSeries,
} from "../../../types/analytics"
import {
  exportAdminAnalytics,
  useAdminAnalyticsKpisQuery,
  useAdminAnalyticsProductsQuery,
  useAdminAnalyticsTrendsQuery,
} from "./data-loading"

const DEFAULT_FILTERS: AdminAnalyticsFilters = {
  date_from: toLocalDateInputValue(addDays(new Date(), -29)),
  date_to: toLocalDateInputValue(new Date()),
  status: [],
  product_id: [],
  frequency: [],
  group_by: AnalyticsGroupBy.DAY,
}

const statusFilterOptions: Array<{
  label: string
  value: AnalyticsSubscriptionStatus
}> = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Past due", value: "past_due" },
  { label: "Cancelled", value: "cancelled" },
]

const frequencyFilterOptions: Array<{
  label: string
  value: AnalyticsFrequencyFilter
}> = [
  { label: "Weekly", value: { interval: "week", value: 1 } },
  { label: "Every 2 weeks", value: { interval: "week", value: 2 } },
  { label: "Monthly", value: { interval: "month", value: 1 } },
  { label: "Quarterly", value: { interval: "month", value: 3 } },
  { label: "Yearly", value: { interval: "year", value: 1 } },
]

const metricTabs: Array<{
  key: AnalyticsMetricKey
  label: string
}> = [
  { key: AnalyticsMetricKey.MRR, label: "MRR" },
  { key: AnalyticsMetricKey.CHURN_RATE, label: "Churn" },
  { key: AnalyticsMetricKey.LTV, label: "LTV" },
  {
    key: AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT,
    label: "Active",
  },
]

const AnalyticsPage = () => {
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(DEFAULT_FILTERS)
  const [selectedMetric, setSelectedMetric] = useState<AnalyticsMetricKey>(
    AnalyticsMetricKey.MRR
  )
  const exportMutation = useMutation({
    mutationFn: (format: AnalyticsExportFormat) =>
      exportAdminAnalytics(filters, format),
    onSuccess: (_response, format) => {
      toast.success(
        `Analytics ${format.toUpperCase()} export downloaded`
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to export analytics"
      )
    },
  })

  const {
    data: kpisData,
    isLoading: isKpisLoading,
    isError: isKpisError,
    error: kpisError,
  } = useAdminAnalyticsKpisQuery(filters)
  const {
    data: trendsData,
    isLoading: isTrendsLoading,
    isError: isTrendsError,
    error: trendsError,
  } = useAdminAnalyticsTrendsQuery(filters)
  const { data: productsData } = useAdminAnalyticsProductsQuery()

  const selectedProductId = filters.product_id[0] ?? "__all"
  const selectedSeries = useMemo(() => {
    const series = trendsData?.series ?? []

    return (
      series.find((item) => item.metric === selectedMetric) ??
      series[0] ??
      null
    )
  }, [selectedMetric, trendsData?.series])

  const hasActiveFilters =
    Boolean(filters.date_from) ||
    Boolean(filters.date_to) ||
    filters.status.length > 0 ||
    filters.product_id.length > 0 ||
    filters.frequency.length > 0 ||
    filters.group_by !== AnalyticsGroupBy.DAY

  const hasAnalyticsData = useMemo(() => {
    const countMetric = kpisData?.kpis.find(
      (item) => item.key === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT
    )
    const hasNonCountMetric = (kpisData?.kpis ?? []).some(
      (item) => item.key !== AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT && item.value !== null
    )
    const hasTrendPoints = (trendsData?.series ?? []).some((series) =>
      series.points.some((point) => point.value !== null)
    )

    return Boolean(countMetric?.value && countMetric.value > 0) || hasNonCountMetric || hasTrendPoints
  }, [kpisData?.kpis, trendsData?.series])

  const pageError = isKpisError ? kpisError : isTrendsError ? trendsError : null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Subscription management
          </Text>
          <Heading level="h1">Analytics</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Review recurring revenue, churn, and active subscription trends from
            the analytics snapshot model.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button
                size="small"
                variant="secondary"
                type="button"
                isLoading={exportMutation.isPending}
                disabled={exportMutation.isPending}
              >
                Export
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item
                disabled={exportMutation.isPending}
                onClick={() => {
                  exportMutation.mutate("csv")
                }}
              >
                Export CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={exportMutation.isPending}
                onClick={() => {
                  exportMutation.mutate("json")
                }}
              >
                Export JSON
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
          <Button asChild size="small" variant="secondary" type="button">
            <Link to="/subscriptions">View Subscriptions</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {filters.status.map((status) => (
            <FilterChip
              key={status}
              label="Status"
              value={formatStatus(status)}
              onRemove={() => {
                setFilters((current) => ({
                  ...current,
                  status: current.status.filter((value) => value !== status),
                }))
              }}
            />
          ))}
          {filters.frequency.map((frequency) => {
            const token = toFrequencyToken(frequency)

            return (
              <FilterChip
                key={token}
                label="Frequency"
                value={formatFrequency(frequency)}
                onRemove={() => {
                  setFilters((current) => ({
                    ...current,
                    frequency: current.frequency.filter(
                      (value) => toFrequencyToken(value) !== token
                    ),
                  }))
                }}
              />
            )
          })}
          {filters.product_id.map((productId) => {
            const product = productsData?.products.find((item) => item.id === productId)

            return (
              <FilterChip
                key={productId}
                label="Product"
                value={product?.title ?? productId}
                onRemove={() => {
                  setFilters((current) => ({
                    ...current,
                    product_id: current.product_id.filter((value) => value !== productId),
                  }))
                }}
              />
            )
          })}
          {filters.group_by !== AnalyticsGroupBy.DAY ? (
            <FilterChip
              label="Group by"
              value={formatGroupBy(filters.group_by)}
              onRemove={() => {
                setFilters((current) => ({
                  ...current,
                  group_by: AnalyticsGroupBy.DAY,
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
                      checked={filters.status.includes(option.value)}
                      onSelect={(event) => {
                        event.preventDefault()
                      }}
                      onCheckedChange={(checked) => {
                        setFilters((current) => ({
                          ...current,
                          status: checked
                            ? [...current.status, option.value]
                            : current.status.filter((value) => value !== option.value),
                        }))
                      }}
                    >
                      {option.label}
                    </DropdownMenu.CheckboxItem>
                  ))}
                </DropdownMenu.SubMenuContent>
              </DropdownMenu.SubMenu>
              <DropdownMenu.SubMenu>
                <DropdownMenu.SubMenuTrigger>Frequency</DropdownMenu.SubMenuTrigger>
                <DropdownMenu.SubMenuContent>
                  {frequencyFilterOptions.map((option) => {
                    const token = toFrequencyToken(option.value)
                    const checked = filters.frequency.some(
                      (value) => toFrequencyToken(value) === token
                    )

                    return (
                      <DropdownMenu.CheckboxItem
                        key={token}
                        checked={checked}
                        onSelect={(event) => {
                          event.preventDefault()
                        }}
                        onCheckedChange={(nextChecked) => {
                          setFilters((current) => ({
                            ...current,
                            frequency: nextChecked
                              ? [...current.frequency, option.value]
                              : current.frequency.filter(
                                  (value) => toFrequencyToken(value) !== token
                                ),
                          }))
                        }}
                      >
                        {option.label}
                      </DropdownMenu.CheckboxItem>
                    )
                  })}
                </DropdownMenu.SubMenuContent>
              </DropdownMenu.SubMenu>
            </DropdownMenu.Content>
          </DropdownMenu>
          {hasActiveFilters ? (
            <button
              type="button"
              className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small-plus rounded-md px-2 py-1 transition-fg"
              onClick={() => {
                setFilters(DEFAULT_FILTERS)
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          <DateField
            label="Date from"
            value={filters.date_from ?? ""}
            onChange={(value) => {
              setFilters((current) => ({ ...current, date_from: value || null }))
            }}
          />
          <DateField
            label="Date to"
            value={filters.date_to ?? ""}
            onChange={(value) => {
              setFilters((current) => ({ ...current, date_to: value || null }))
            }}
          />
          <div className="flex flex-col gap-y-1">
            <Text size="small" leading="compact" weight="plus">
              Product
            </Text>
            <Select
              value={selectedProductId}
              onValueChange={(value) => {
                setFilters((current) => ({
                  ...current,
                  product_id: value === "__all" ? [] : [value],
                }))
              }}
            >
              <Select.Trigger>
                <Select.Value placeholder="All products" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__all">All products</Select.Item>
                {(productsData?.products ?? []).map((product) => (
                  <Select.Item key={product.id} value={product.id}>
                    {product.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" leading="compact" weight="plus">
              Group by
            </Text>
            <Select
              value={filters.group_by}
              onValueChange={(value) => {
                setFilters((current) => ({
                  ...current,
                  group_by: value as AnalyticsGroupBy,
                }))
              }}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={AnalyticsGroupBy.DAY}>Day</Select.Item>
                <Select.Item value={AnalyticsGroupBy.WEEK}>Week</Select.Item>
                <Select.Item value={AnalyticsGroupBy.MONTH}>Month</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-6">
        {pageError ? (
          <Alert variant="error">
            {pageError instanceof Error
              ? pageError.message
              : "Failed to load analytics."}
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isKpisLoading && !kpisData
            ? metricTabs.map((metric) => <MetricCardSkeleton key={metric.key} />)
            : (kpisData?.kpis ?? []).map((metric) => (
                <MetricCard key={metric.key} metric={metric} />
              ))}
        </div>

        <Container className="p-0">
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <Heading level="h2">Trend overview</Heading>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  Trends are bucketed in UTC and follow the same filters as the
                  KPI cards.
                </Text>
              </div>
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                {formatGroupBy(filters.group_by)} buckets
              </Text>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {metricTabs.map((metric) => (
                <Button
                  key={metric.key}
                  size="small"
                  type="button"
                  variant={selectedMetric === metric.key ? "primary" : "secondary"}
                  onClick={() => {
                    setSelectedMetric(metric.key)
                  }}
                >
                  {metric.label}
                </Button>
              ))}
            </div>

            {isTrendsLoading && !trendsData ? (
              <TrendChartSkeleton />
            ) : !hasAnalyticsData || !selectedSeries ? (
              <EmptyAnalyticsState
                title="No analytics data for this range"
                description="Try widening the date range or removing filters to inspect a broader slice of subscription activity."
              />
            ) : (
              <TrendChart series={selectedSeries} />
            )}
          </div>
        </Container>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Analytics",
  rank: 5,
})

export const handle = {
  breadcrumb: () => "Analytics",
}

export default AnalyticsPage

const DateField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) => {
  return (
    <div className="flex flex-col gap-y-1">
      <Text size="small" leading="compact" weight="plus">
        {label}
      </Text>
      <Input
        type="date"
        size="small"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}

const MetricCard = ({ metric }: { metric: AnalyticsKpiSummary }) => {
  return (
    <Container className="p-0">
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {metric.label}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-muted">
            {formatUnitLabel(metric)}
          </Text>
        </div>
        <Heading level="h2">{formatMetricValue(metric.value, metric)}</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {formatMetricDelta(metric)}
        </Text>
      </div>
    </Container>
  )
}

const MetricCardSkeleton = () => {
  return (
    <Container className="p-0">
      <div className="flex animate-pulse flex-col gap-3 px-5 py-4">
        <div className="h-4 w-20 rounded bg-ui-bg-disabled" />
        <div className="h-8 w-32 rounded bg-ui-bg-disabled" />
        <div className="h-4 w-28 rounded bg-ui-bg-disabled" />
      </div>
    </Container>
  )
}

const EmptyAnalyticsState = ({
  title,
  description,
}: {
  title: string
  description: string
}) => {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ui-border-base px-6 py-12 text-center">
      <Heading level="h3">{title}</Heading>
      <Text size="small" leading="compact" className="max-w-xl text-ui-fg-subtle">
        {description}
      </Text>
    </div>
  )
}

const TrendChartSkeleton = () => {
  return (
    <div className="flex animate-pulse flex-col gap-4 rounded-lg border border-ui-border-base px-4 py-4">
      <div className="h-4 w-28 rounded bg-ui-bg-disabled" />
      <div className="h-[260px] rounded bg-ui-bg-disabled" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-4 rounded bg-ui-bg-disabled" />
        <div className="h-4 rounded bg-ui-bg-disabled" />
        <div className="h-4 rounded bg-ui-bg-disabled" />
      </div>
    </div>
  )
}

const TrendChart = ({ series }: { series: AnalyticsTrendSeries }) => {
  const numericPoints = series.points
    .map((point, index) => ({
      index,
      value: point.value,
      bucket_start: point.bucket_start,
      bucket_end: point.bucket_end,
    }))
    .filter((point): point is {
      index: number
      value: number
      bucket_start: string
      bucket_end: string
    } => typeof point.value === "number")

  if (!numericPoints.length) {
    return (
      <EmptyAnalyticsState
        title="No trend points available"
        description="This metric does not have enough snapshot data for the selected filters."
      />
    )
  }

  const width = 960
  const height = 280
  const padding = 24
  const min = Math.min(...numericPoints.map((point) => point.value))
  const max = Math.max(...numericPoints.map((point) => point.value))
  const range = max - min || 1
  const totalPoints = numericPoints.length - 1 || 1

  const coordinates = numericPoints.map((point, pointIndex) => {
    const x =
      padding + (pointIndex / totalPoints) * (width - padding * 2)
    const y =
      height -
      padding -
      ((point.value - min) / range) * (height - padding * 2)

    return {
      ...point,
      x,
      y,
    }
  })

  const linePath = coordinates
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ")
  const areaPath = `${linePath} L ${
    coordinates[coordinates.length - 1].x
  } ${height - padding} L ${coordinates[0].x} ${height - padding} Z`
  const referencePoints = [
    coordinates[0],
    coordinates[Math.floor(coordinates.length / 2)],
    coordinates[coordinates.length - 1],
  ].filter(
    (point, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.bucket_start === point.bucket_start &&
          candidate.bucket_end === point.bucket_end
      ) === index
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
        <div className="flex flex-col">
          <Text size="small" leading="compact" weight="plus">
            {series.label}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {formatSeriesRangeSummary(series)}
          </Text>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Max {formatTrendValue(max, series)}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Min {formatTrendValue(min, series)}
          </Text>
        </div>
      </div>
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${series.label} trend chart`}
          className="h-[280px] w-full"
        >
          <defs>
            <linearGradient id="analytics-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#d6d9df"
            strokeWidth="1"
          />
          <path d={areaPath} fill="url(#analytics-area-gradient)" />
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {coordinates.map((point) => (
            <circle
              key={`${point.bucket_start}-${point.index}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {referencePoints.map((point) => (
          <div
            key={`${point.bucket_start}-${point.bucket_end}`}
            className="rounded-md border border-ui-border-base px-3 py-2"
          >
            <Text size="small" leading="compact" weight="plus">
              {formatDateLabel(point.bucket_start)}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {formatTrendValue(point.value, series)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}

type FilterChipProps = {
  label: string
  value: string
  onRemove: () => void
}

const FilterChip = ({ label, value, onRemove }: FilterChipProps) => {
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

function formatMetricValue(
  value: number | null,
  metric: Pick<AnalyticsKpiSummary, "unit" | "currency_code" | "precision">
) {
  if (value === null) {
    return "Unavailable"
  }

  switch (metric.unit) {
    case "currency":
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: metric.currency_code || "USD",
        minimumFractionDigits: metric.precision,
        maximumFractionDigits: metric.precision,
      }).format(value)
    case "percentage":
      return `${value.toFixed(metric.precision)}%`
    case "count":
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 0,
      }).format(value)
  }
}

function formatMetricDelta(metric: AnalyticsKpiSummary) {
  if (metric.previous_value === null || metric.delta_value === null) {
    return "No comparison window available yet."
  }

  const direction =
    metric.delta_value > 0 ? "up" : metric.delta_value < 0 ? "down" : "flat"
  const delta =
    metric.unit === "count"
      ? new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 0,
        }).format(Math.abs(metric.delta_value))
      : Math.abs(metric.delta_value).toFixed(metric.precision)

  return `${direction === "flat" ? "Flat" : `Trending ${direction}`} vs previous window · ${delta}${
    metric.unit === "percentage" ? "%" : ""
  }`
}

function formatUnitLabel(metric: Pick<AnalyticsKpiSummary, "unit" | "currency_code">) {
  switch (metric.unit) {
    case "currency":
      return metric.currency_code?.toUpperCase() ?? "Currency"
    case "percentage":
      return "Percent"
    case "count":
      return "Subscriptions"
  }
}

function formatTrendValue(value: number | null, series: AnalyticsTrendSeries) {
  if (value === null) {
    return "Unavailable"
  }

  return formatMetricValue(value, {
    unit: series.unit,
    currency_code: series.currency_code,
    precision: series.precision,
  })
}

function formatSeriesRangeSummary(series: AnalyticsTrendSeries) {
  if (!series.points.length) {
    return "No buckets returned for the current range."
  }

  return `${formatDateLabel(series.points[0].bucket_start)} to ${formatDateLabel(
    series.points[series.points.length - 1].bucket_end
  )}`
}

function formatDateLabel(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date)
}

function formatStatus(value: AnalyticsSubscriptionStatus) {
  switch (value) {
    case "active":
      return "Active"
    case "paused":
      return "Paused"
    case "cancelled":
      return "Cancelled"
    case "past_due":
      return "Past due"
  }
}

function formatGroupBy(value: AnalyticsGroupBy) {
  switch (value) {
    case AnalyticsGroupBy.DAY:
      return "Day"
    case AnalyticsGroupBy.WEEK:
      return "Week"
    case AnalyticsGroupBy.MONTH:
      return "Month"
  }
}

function formatFrequency(value: AnalyticsFrequencyFilter) {
  switch (value.interval) {
    case "week":
      return value.value === 1 ? "Weekly" : `Every ${value.value} weeks`
    case "month":
      return value.value === 1 ? "Monthly" : `Every ${value.value} months`
    case "year":
      return value.value === 1 ? "Yearly" : `Every ${value.value} years`
  }
}

function toFrequencyToken(value: AnalyticsFrequencyFilter) {
  return `${value.interval}:${value.value}`
}

function toLocalDateInputValue(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)

  const year = next.getFullYear()
  const month = `${next.getMonth() + 1}`.padStart(2, "0")
  const day = `${next.getDate()}`.padStart(2, "0")

  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)

  return next
}
