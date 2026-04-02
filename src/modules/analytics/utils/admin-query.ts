import { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminAnalyticsFilters,
  AnalyticsExportAdminResponse,
  AnalyticsExportFormat,
  AnalyticsFrequencyFilter,
  AnalyticsFrequencyInterval,
  AnalyticsGroupBy,
  AnalyticsKpiSummary,
  AnalyticsKpisAdminResponse,
  AnalyticsMetricKey,
  AnalyticsSubscriptionStatus,
  AnalyticsTrendPoint,
  AnalyticsTrendSeries,
  AnalyticsTrendsAdminResponse,
} from "../../../admin/types/analytics"

type QueryLike = {
  graph(input: Record<string, unknown>): Promise<{
    data?: unknown[]
    metadata?: {
      count?: number
      take?: number
      skip?: number
    }
  }>
}

type SubscriptionMetricsDailyRecord = {
  id: string
  metric_date: string
  subscription_id: string
  customer_id: string
  product_id: string
  variant_id: string
  status: AnalyticsSubscriptionStatus
  frequency_interval: AnalyticsFrequencyInterval
  frequency_value: number
  currency_code: string | null
  is_active: boolean
  active_subscriptions_count: number
  mrr_amount: number | string | null
  churned_subscriptions_count: number
  churn_reason_category: string | null
  source_snapshot: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type DaySummary = {
  metric_date: string
  active_subscriptions_count: number
  churned_subscriptions_count: number
  mrr_amount: number | null
  currency_code: string | null
  has_mixed_currency: boolean
}

type BucketSummary = {
  bucket_start: string
  bucket_end: string
  active_subscriptions_count: number
  churned_subscriptions_count: number
  avg_daily_active_subscriptions_count: number
  mrr_amount: number | null
  currency_code: string | null
  has_mixed_currency: boolean
}

export type ListAdminAnalyticsInput = {
  date_from?: string | Date | null
  date_to?: string | Date | null
  status?: AnalyticsSubscriptionStatus[]
  product_id?: string[]
  frequency?: Array<string | AnalyticsFrequencyFilter>
  group_by?: AnalyticsGroupBy
  format?: AnalyticsExportFormat
  timezone?: "UTC" | string | null
}

type ResolvedAnalyticsQueryInput = {
  filters: AdminAnalyticsFilters
  format: AnalyticsExportFormat
}

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_ANALYTICS_TIMEZONE = "UTC"
const MAX_ANALYTICS_WINDOW_DAYS = 731
const METRIC_LABELS: Record<AnalyticsMetricKey, string> = {
  [AnalyticsMetricKey.MRR]: "MRR",
  [AnalyticsMetricKey.CHURN_RATE]: "Churn Rate",
  [AnalyticsMetricKey.LTV]: "LTV",
  [AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT]: "Active Subscriptions",
}

function getQuery(container: MedusaContainer) {
  return container.resolve<QueryLike>(ContainerRegistrationKeys.QUERY)
}

function toUtcDayStart(value: Date | string) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value)

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  )
}

function toUtcDayEnd(value: Date | string) {
  const dayStart = toUtcDayStart(value)

  return new Date(
    Date.UTC(
      dayStart.getUTCFullYear(),
      dayStart.getUTCMonth(),
      dayStart.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

function toUtcWeekStart(value: Date | string) {
  const dayStart = toUtcDayStart(value)
  const utcDay = dayStart.getUTCDay()
  const offset = utcDay === 0 ? -6 : 1 - utcDay
  const weekStart = new Date(dayStart)
  weekStart.setUTCDate(weekStart.getUTCDate() + offset)

  return weekStart
}

function toUtcWeekEnd(value: Date | string) {
  const weekStart = toUtcWeekStart(value)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  return weekEnd
}

function toUtcMonthStart(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(value)

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)
  )
}

function toUtcMonthEnd(value: Date | string) {
  const monthStart = toUtcMonthStart(value)

  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999
    )
  )
}

function diffDaysInclusive(dateFrom: Date, dateTo: Date) {
  return (
    Math.floor(
      (toUtcDayStart(dateTo).getTime() - toUtcDayStart(dateFrom).getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1
  )
}

function shiftDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)

  return next
}

function roundValue(value: number | null, precision: number) {
  if (value === null || !Number.isFinite(value)) {
    return null
  }

  return Number(value.toFixed(precision))
}

function parseFrequencyToken(token: string): AnalyticsFrequencyFilter {
  const [interval, rawValue] = token.split(":")
  const parsedValue = Number.parseInt(rawValue ?? "", 10)

  if (
    !interval ||
    !["week", "month", "year"].includes(interval) ||
    !Number.isFinite(parsedValue) ||
    parsedValue <= 0
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unsupported frequency token '${token}'`
    )
  }

  return {
    interval: interval as AnalyticsFrequencyInterval,
    value: parsedValue,
  }
}

function normalizeFrequencyFilters(
  filters?: Array<string | AnalyticsFrequencyFilter>
): AnalyticsFrequencyFilter[] {
  if (!filters?.length) {
    return []
  }

  return filters.map((filter) => {
    if (typeof filter === "string") {
      return parseFrequencyToken(filter)
    }

    if (
      !["week", "month", "year"].includes(filter.interval) ||
      !Number.isFinite(filter.value) ||
      filter.value <= 0
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unsupported frequency filter '${filter.interval}:${filter.value}'`
      )
    }

    return {
      interval: filter.interval,
      value: filter.value,
    }
  })
}

function normalizeAnalyticsQueryInput(
  input: ListAdminAnalyticsInput
): ResolvedAnalyticsQueryInput {
  const now = new Date()
  const resolvedTo = input.date_to ? toUtcDayEnd(input.date_to) : toUtcDayEnd(now)
  const resolvedFrom = input.date_from
    ? toUtcDayStart(input.date_from)
    : toUtcDayStart(shiftDays(resolvedTo, -(DEFAULT_LOOKBACK_DAYS - 1)))

  if (resolvedFrom.getTime() > resolvedTo.getTime()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Analytics 'date_from' must be less than or equal to 'date_to'"
    )
  }

  const timezone = input.timezone ?? DEFAULT_ANALYTICS_TIMEZONE

  if (timezone !== DEFAULT_ANALYTICS_TIMEZONE) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unsupported analytics timezone '${timezone}'. Only 'UTC' is supported in MVP`
    )
  }

  const requestedWindowDays = diffDaysInclusive(resolvedFrom, resolvedTo)

  if (requestedWindowDays > MAX_ANALYTICS_WINDOW_DAYS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Analytics query window can't exceed ${MAX_ANALYTICS_WINDOW_DAYS} days`
    )
  }

  const groupBy = input.group_by ?? AnalyticsGroupBy.DAY

  return {
    filters: {
      date_from: resolvedFrom.toISOString(),
      date_to: resolvedTo.toISOString(),
      status: input.status ?? [],
      product_id: input.product_id ?? [],
      frequency: normalizeFrequencyFilters(input.frequency),
      group_by: groupBy,
    },
    format: input.format ?? "json",
  }
}

async function listMetricsDailyRows(
  container: MedusaContainer,
  filters: AdminAnalyticsFilters
): Promise<SubscriptionMetricsDailyRecord[]> {
  const query = getQuery(container)
  const rows: SubscriptionMetricsDailyRecord[] = []
  const take = 500
  let skip = 0

  while (true) {
    const result = await query.graph({
      entity: "subscription_metrics_daily",
      fields: [
        "id",
        "metric_date",
        "subscription_id",
        "customer_id",
        "product_id",
        "variant_id",
        "status",
        "frequency_interval",
        "frequency_value",
        "currency_code",
        "is_active",
        "active_subscriptions_count",
        "mrr_amount",
        "churned_subscriptions_count",
        "churn_reason_category",
      ],
      filters: {
        metric_date: {
          $gte: filters.date_from,
          $lte: filters.date_to,
        },
        ...(filters.status.length ? { status: filters.status } : {}),
        ...(filters.product_id.length ? { product_id: filters.product_id } : {}),
      },
      pagination: {
        take,
        skip,
        order: {
          metric_date: "ASC",
          id: "ASC",
        },
      },
    })

    const batch = (result.data ?? []) as SubscriptionMetricsDailyRecord[]
    rows.push(...batch)

    if (!batch.length || rows.length >= (result.metadata?.count ?? 0)) {
      break
    }

    skip += result.metadata?.take ?? take
  }

  if (!filters.frequency.length) {
    return rows
  }

  const allowedTokens = new Set(
    filters.frequency.map((frequency) => `${frequency.interval}:${frequency.value}`)
  )

  return rows.filter((row) =>
    allowedTokens.has(`${row.frequency_interval}:${row.frequency_value}`)
  )
}

function buildDaySummaries(rows: SubscriptionMetricsDailyRecord[]) {
  const summaryByDay = new Map<string, DaySummary>()

  for (const row of rows) {
    const metricDate = toUtcDayStart(row.metric_date).toISOString()
    const current = summaryByDay.get(metricDate) ?? {
      metric_date: metricDate,
      active_subscriptions_count: 0,
      churned_subscriptions_count: 0,
      mrr_amount: 0,
      currency_code: null,
      has_mixed_currency: false,
    }

    current.active_subscriptions_count += Number(row.active_subscriptions_count ?? 0)
    current.churned_subscriptions_count += Number(
      row.churned_subscriptions_count ?? 0
    )

    const mrrAmount =
      row.mrr_amount === null || row.mrr_amount === undefined
        ? null
        : Number(row.mrr_amount)

    if (current.has_mixed_currency) {
      summaryByDay.set(metricDate, current)
      continue
    }

    if (mrrAmount !== null && Number.isFinite(mrrAmount)) {
      current.mrr_amount = (current.mrr_amount ?? 0) + mrrAmount

      if (!current.currency_code) {
        current.currency_code = row.currency_code ?? null
      } else if (
        row.currency_code &&
        current.currency_code &&
        row.currency_code !== current.currency_code
      ) {
        current.has_mixed_currency = true
        current.mrr_amount = null
        current.currency_code = null
      }
    }

    summaryByDay.set(metricDate, current)
  }

  return [...summaryByDay.values()].sort((a, b) =>
    a.metric_date.localeCompare(b.metric_date)
  )
}

function getBucketBounds(metricDate: string, groupBy: AnalyticsGroupBy) {
  if (groupBy === AnalyticsGroupBy.WEEK) {
    return {
      bucket_start: toUtcWeekStart(metricDate).toISOString(),
      bucket_end: toUtcWeekEnd(metricDate).toISOString(),
    }
  }

  if (groupBy === AnalyticsGroupBy.MONTH) {
    return {
      bucket_start: toUtcMonthStart(metricDate).toISOString(),
      bucket_end: toUtcMonthEnd(metricDate).toISOString(),
    }
  }

  return {
    bucket_start: toUtcDayStart(metricDate).toISOString(),
    bucket_end: toUtcDayEnd(metricDate).toISOString(),
  }
}

function buildBucketSummaries(
  daySummaries: DaySummary[],
  groupBy: AnalyticsGroupBy
): BucketSummary[] {
  const bucketMap = new Map<string, BucketSummary & { day_count: number }>()

  for (const day of daySummaries) {
    const bounds = getBucketBounds(day.metric_date, groupBy)
    const current = bucketMap.get(bounds.bucket_start) ?? {
      bucket_start: bounds.bucket_start,
      bucket_end: bounds.bucket_end,
      active_subscriptions_count: 0,
      churned_subscriptions_count: 0,
      avg_daily_active_subscriptions_count: 0,
      mrr_amount: 0,
      currency_code: null,
      has_mixed_currency: false,
      day_count: 0,
    }

    current.day_count += 1
    current.active_subscriptions_count = day.active_subscriptions_count
    current.avg_daily_active_subscriptions_count += day.active_subscriptions_count
    current.churned_subscriptions_count += day.churned_subscriptions_count

    if (day.has_mixed_currency) {
      current.has_mixed_currency = true
      current.mrr_amount = null
      current.currency_code = null
    } else if (!current.has_mixed_currency && day.mrr_amount !== null) {
      current.mrr_amount = day.mrr_amount

      if (!current.currency_code) {
        current.currency_code = day.currency_code
      } else if (
        day.currency_code &&
        current.currency_code &&
        day.currency_code !== current.currency_code
      ) {
        current.has_mixed_currency = true
        current.mrr_amount = null
        current.currency_code = null
      }
    }

    bucketMap.set(bounds.bucket_start, current)
  }

  return [...bucketMap.values()]
    .sort((a, b) => a.bucket_start.localeCompare(b.bucket_start))
    .map((bucket) => ({
      bucket_start: bucket.bucket_start,
      bucket_end: bucket.bucket_end,
      active_subscriptions_count: bucket.active_subscriptions_count,
      churned_subscriptions_count: bucket.churned_subscriptions_count,
      avg_daily_active_subscriptions_count: bucket.day_count
        ? bucket.avg_daily_active_subscriptions_count / bucket.day_count
        : 0,
      mrr_amount: bucket.has_mixed_currency ? null : bucket.mrr_amount,
      currency_code: bucket.has_mixed_currency ? null : bucket.currency_code,
      has_mixed_currency: bucket.has_mixed_currency,
    }))
}

function computeChurnRate(
  churnedCount: number,
  averageActiveBase: number
) {
  if (!averageActiveBase || averageActiveBase <= 0) {
    return 0
  }

  return (churnedCount / averageActiveBase) * 100
}

function computeLtv(mrr: number | null, churnRate: number) {
  if (mrr === null || churnRate <= 0) {
    return null
  }

  return mrr / (churnRate / 100)
}

function metricUnit(metric: AnalyticsMetricKey): "currency" | "percentage" | "count" {
  if (metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT) {
    return "count"
  }

  if (metric === AnalyticsMetricKey.CHURN_RATE) {
    return "percentage"
  }

  return "currency"
}

function metricPrecision(metric: AnalyticsMetricKey) {
  return metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT ? 0 : 2
}

function buildKpiValue(
  metric: AnalyticsMetricKey,
  value: number | null,
  previousValue: number | null,
  currencyCode: string | null
): AnalyticsKpiSummary {
  const deltaValue =
    value === null || previousValue === null ? null : value - previousValue
  const deltaPercentage =
    deltaValue === null || previousValue === null || previousValue === 0
      ? null
      : (deltaValue / Math.abs(previousValue)) * 100

  return {
    key: metric,
    label: METRIC_LABELS[metric],
    value: roundValue(value, metricPrecision(metric)),
    unit: metricUnit(metric),
    currency_code: metricUnit(metric) === "currency" ? currencyCode : null,
    precision: metricPrecision(metric),
    previous_value: roundValue(previousValue, metricPrecision(metric)),
    delta_value: roundValue(deltaValue, metricPrecision(metric)),
    delta_percentage: roundValue(deltaPercentage, 2),
  }
}

function getLatestBucketValue<T extends number | null>(
  buckets: BucketSummary[],
  selector: (bucket: BucketSummary) => T
) {
  if (!buckets.length) {
    return null
  }

  return selector(buckets[buckets.length - 1])
}

function deriveKpiSet(buckets: BucketSummary[]) {
  const latestMrr = getLatestBucketValue(buckets, (bucket) =>
    bucket.has_mixed_currency ? null : bucket.mrr_amount
  )
  const latestCurrencyCode = buckets.length
    ? buckets[buckets.length - 1].currency_code
    : null
  const latestActiveCount = getLatestBucketValue(
    buckets,
    (bucket) => bucket.active_subscriptions_count
  )
  const totalChurned = buckets.reduce(
    (sum, bucket) => sum + bucket.churned_subscriptions_count,
    0
  )
  const averageActiveBase = buckets.length
    ? buckets.reduce(
        (sum, bucket) => sum + bucket.avg_daily_active_subscriptions_count,
        0
      ) / buckets.length
    : 0
  const churnRate = computeChurnRate(totalChurned, averageActiveBase)
  const ltv = computeLtv(latestMrr, churnRate)

  return {
    mrr: latestMrr,
    mrr_currency_code: latestCurrencyCode,
    active_subscriptions_count: latestActiveCount ?? 0,
    churn_rate: churnRate,
    ltv,
  }
}

function buildTrendPoints(
  buckets: BucketSummary[],
  metric: AnalyticsMetricKey
): AnalyticsTrendPoint[] {
  return buckets.map((bucket) => {
    let value: number | null

    if (metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT) {
      value = bucket.active_subscriptions_count
    } else if (metric === AnalyticsMetricKey.MRR) {
      value = bucket.has_mixed_currency ? null : bucket.mrr_amount
    } else if (metric === AnalyticsMetricKey.CHURN_RATE) {
      value = computeChurnRate(
        bucket.churned_subscriptions_count,
        bucket.avg_daily_active_subscriptions_count
      )
    } else {
      value = computeLtv(
        bucket.has_mixed_currency ? null : bucket.mrr_amount,
        computeChurnRate(
          bucket.churned_subscriptions_count,
          bucket.avg_daily_active_subscriptions_count
        )
      )
    }

    return {
      bucket_start: bucket.bucket_start,
      bucket_end: bucket.bucket_end,
      value: roundValue(value, metricPrecision(metric)),
    }
  })
}

function buildTrendSeries(
  buckets: BucketSummary[],
  metric: AnalyticsMetricKey
): AnalyticsTrendSeries {
  const currencyCode =
    metricUnit(metric) === "currency"
      ? buckets.find((bucket) => bucket.currency_code)?.currency_code ?? null
      : null

  return {
    metric,
    label: METRIC_LABELS[metric],
    unit: metricUnit(metric),
    currency_code: currencyCode,
    precision: metricPrecision(metric),
    points: buildTrendPoints(buckets, metric),
  }
}

async function buildAnalyticsSnapshot(
  container: MedusaContainer,
  input: ListAdminAnalyticsInput
) {
  const normalized = normalizeAnalyticsQueryInput(input)
  const currentRows = await listMetricsDailyRows(container, normalized.filters)
  const currentDaySummaries = buildDaySummaries(currentRows)
  const currentBuckets = buildBucketSummaries(
    currentDaySummaries,
    normalized.filters.group_by
  )

  const resolvedFrom = new Date(normalized.filters.date_from ?? new Date())
  const resolvedTo = new Date(normalized.filters.date_to ?? new Date())
  const currentWindowDays = diffDaysInclusive(resolvedFrom, resolvedTo)
  const previousTo = toUtcDayEnd(shiftDays(resolvedFrom, -1))
  const previousFrom = toUtcDayStart(
    shiftDays(previousTo, -(currentWindowDays - 1))
  )
  const previousFilters: AdminAnalyticsFilters = {
    ...normalized.filters,
    date_from: previousFrom.toISOString(),
    date_to: previousTo.toISOString(),
  }
  const previousRows = await listMetricsDailyRows(container, previousFilters)
  const previousBuckets = buildBucketSummaries(
    buildDaySummaries(previousRows),
    normalized.filters.group_by
  )

  return {
    normalized,
    currentBuckets,
    previousBuckets,
  }
}

export async function getAdminAnalyticsKpis(
  container: MedusaContainer,
  input: ListAdminAnalyticsInput
): Promise<AnalyticsKpisAdminResponse> {
  const snapshot = await buildAnalyticsSnapshot(container, input)
  const currentSet = deriveKpiSet(snapshot.currentBuckets)
  const previousSet = deriveKpiSet(snapshot.previousBuckets)

  return {
    filters: snapshot.normalized.filters,
    generated_at: new Date().toISOString(),
    kpis: [
      buildKpiValue(
        AnalyticsMetricKey.MRR,
        currentSet.mrr,
        previousSet.mrr,
        currentSet.mrr_currency_code
      ),
      buildKpiValue(
        AnalyticsMetricKey.CHURN_RATE,
        currentSet.churn_rate,
        previousSet.churn_rate,
        null
      ),
      buildKpiValue(
        AnalyticsMetricKey.LTV,
        currentSet.ltv,
        previousSet.ltv,
        currentSet.mrr_currency_code
      ),
      buildKpiValue(
        AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT,
        currentSet.active_subscriptions_count,
        previousSet.active_subscriptions_count,
        null
      ),
    ],
  }
}

export async function getAdminAnalyticsTrends(
  container: MedusaContainer,
  input: ListAdminAnalyticsInput
): Promise<AnalyticsTrendsAdminResponse> {
  const normalized = normalizeAnalyticsQueryInput(input)
  const rows = await listMetricsDailyRows(container, normalized.filters)
  const buckets = buildBucketSummaries(
    buildDaySummaries(rows),
    normalized.filters.group_by
  )

  return {
    filters: normalized.filters,
    generated_at: new Date().toISOString(),
    series: [
      buildTrendSeries(buckets, AnalyticsMetricKey.MRR),
      buildTrendSeries(buckets, AnalyticsMetricKey.CHURN_RATE),
      buildTrendSeries(buckets, AnalyticsMetricKey.LTV),
      buildTrendSeries(buckets, AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT),
    ],
  }
}

export async function getAdminAnalyticsExport(
  container: MedusaContainer,
  input: ListAdminAnalyticsInput
): Promise<AnalyticsExportAdminResponse> {
  const normalized = normalizeAnalyticsQueryInput(input)
  const rows = await listMetricsDailyRows(container, normalized.filters)
  const buckets = buildBucketSummaries(
    buildDaySummaries(rows),
    normalized.filters.group_by
  )
  const series = [
    buildTrendSeries(buckets, AnalyticsMetricKey.MRR),
    buildTrendSeries(buckets, AnalyticsMetricKey.CHURN_RATE),
    buildTrendSeries(buckets, AnalyticsMetricKey.LTV),
    buildTrendSeries(buckets, AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT),
  ]
  const rowCount = series[0]?.points.length ?? 0
  const columns = [
    "bucket_start",
    "bucket_end",
    "mrr",
    "churn_rate",
    "ltv",
    "active_subscriptions_count",
  ]
  const exportRows: Array<Record<string, string | number | null>> = []

  for (let index = 0; index < rowCount; index += 1) {
    const mrrPoint =
      series.find((seriesItem) => seriesItem.metric === AnalyticsMetricKey.MRR)
        ?.points[index] ?? null
    const churnPoint =
      series.find(
        (seriesItem) => seriesItem.metric === AnalyticsMetricKey.CHURN_RATE
      )
        ?.points[index] ?? null
    const ltvPoint =
      series.find((seriesItem) => seriesItem.metric === AnalyticsMetricKey.LTV)
        ?.points[index] ?? null
    const activePoint =
      series.find(
        (seriesItem) =>
          seriesItem.metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT
      )?.points[index] ?? null

    exportRows.push({
      bucket_start: mrrPoint?.bucket_start ?? activePoint?.bucket_start ?? null,
      bucket_end: mrrPoint?.bucket_end ?? activePoint?.bucket_end ?? null,
      mrr: mrrPoint?.value ?? null,
      churn_rate: churnPoint?.value ?? null,
      ltv: ltvPoint?.value ?? null,
      active_subscriptions_count: activePoint?.value ?? null,
    })
  }

  return {
    format: normalized.format,
    filters: normalized.filters,
    generated_at: new Date().toISOString(),
    file_name: `subscription-analytics-${new Date().toISOString().slice(0, 10)}.${normalized.format}`,
    content_type:
      normalized.format === "csv" ? "text/csv" : "application/json",
    columns,
    rows: exportRows,
  }
}
