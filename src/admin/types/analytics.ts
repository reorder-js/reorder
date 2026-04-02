export enum AnalyticsGroupBy {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
}

export enum AnalyticsMetricKey {
  MRR = "mrr",
  CHURN_RATE = "churn_rate",
  LTV = "ltv",
  ACTIVE_SUBSCRIPTIONS_COUNT = "active_subscriptions_count",
}

export type AnalyticsSubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "past_due"

export type AnalyticsFrequencyInterval = "week" | "month" | "year"

export type AnalyticsFrequencyFilter = {
  interval: AnalyticsFrequencyInterval
  value: number
}

export type AdminAnalyticsFilters = {
  date_from: string | null
  date_to: string | null
  status: AnalyticsSubscriptionStatus[]
  product_id: string[]
  frequency: AnalyticsFrequencyFilter[]
  group_by: AnalyticsGroupBy
}

export type AnalyticsMetricValue = {
  key: AnalyticsMetricKey
  label: string
  value: number | null
  unit: "currency" | "percentage" | "count"
  currency_code: string | null
  precision: number
}

export type AnalyticsKpiSummary = AnalyticsMetricValue & {
  previous_value: number | null
  delta_value: number | null
  delta_percentage: number | null
}

export type AnalyticsKpisAdminResponse = {
  filters: AdminAnalyticsFilters
  generated_at: string
  kpis: AnalyticsKpiSummary[]
}

export type AnalyticsTrendPoint = {
  bucket_start: string
  bucket_end: string
  value: number | null
}

export type AnalyticsTrendSeries = {
  metric: AnalyticsMetricKey
  label: string
  unit: "currency" | "percentage" | "count"
  currency_code: string | null
  precision: number
  points: AnalyticsTrendPoint[]
}

export type AnalyticsTrendsAdminResponse = {
  filters: AdminAnalyticsFilters
  generated_at: string
  series: AnalyticsTrendSeries[]
}

export type AnalyticsExportFormat = "csv" | "json"

export type AnalyticsExportAdminResponse = {
  format: AnalyticsExportFormat
  filters: AdminAnalyticsFilters
  generated_at: string
  file_name: string
  content_type: string
  columns: string[]
  rows: Array<Record<string, string | number | null>>
}
