# Admin Analytics API

This document describes the implemented Admin API contract for the `Analytics` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request parameters
- response shapes
- filtering and grouping rules
- export response contract

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/subscription-analytics`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- route handlers stay thin and delegate read logic to analytics query helpers or read services

This keeps the API aligned with Medusa Admin read-model conventions.

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/analytics.ts`

Main response types:
- `AnalyticsKpisAdminResponse`
- `AnalyticsTrendsAdminResponse`
- `AnalyticsExportAdminResponse`
- `AdminAnalyticsFilters`
- `AnalyticsKpiSummary`
- `AnalyticsTrendSeries`

All successful analytics responses also include:
- `metrics_version`

## Shared Domain Values

### Metric Keys

Supported KPI and trend metric keys:
- `mrr`
- `churn_rate`
- `ltv`
- `active_subscriptions_count`

### Grouping Values

Supported grouping values:
- `day`
- `week`
- `month`

### Subscription Status Filter Values

Supported subscription status filter values:
- `active`
- `paused`
- `cancelled`
- `past_due`

### Frequency Filter Values

Frequency filters use structured cadence values:
- `interval`
  - `week`
  - `month`
  - `year`
- `value`
  - positive integer cadence value

Examples:
- weekly: `interval = "week", value = 1`
- every 2 weeks: `interval = "week", value = 2`
- monthly: `interval = "month", value = 1`

## Shared Filter Contract

All analytics read routes use the same logical filter contract.

Supported filters:
- `date_from?: string`
- `date_to?: string`
- `status?: string | string[]`
- `product_id?: string | string[]`
- `frequency?: string | string[]`
- `group_by?: "day" | "week" | "month"`
- `timezone?: "UTC"`

Notes:
- `date_from` and `date_to` are ISO-like timestamps or date strings interpreted by the API validator.
- `status` is a multi-value filter.
- `product_id` is a multi-value filter.
- `frequency` is a multi-value filter represented in requests using a serialized cadence token.
- `group_by` defaults to `day` when omitted.
- `timezone` defaults to `UTC` when omitted.
- MVP analytics reject non-`UTC` timezone values.

### Shared Validation Rules

Current runtime validation rules:
- `date_from <= date_to`
- maximum analytics read window is `731` days
- `frequency` tokens must match `week:n`, `month:n`, or `year:n`
- unsupported `timezone` values are rejected

### Empty Dataset Rules

An empty dataset is not treated as an API error.

Current runtime behavior:
- `kpis` still returns all KPI keys
- `trends` returns valid series with empty or null-valued points depending on the range
- `export` returns a valid payload with empty `rows`

### Frequency Request Encoding

For request simplicity, frequency filters are passed as serialized tokens.

Recommended encoding:
- `week:1`
- `week:2`
- `month:1`
- `year:1`

The API parses these values into the Admin DTO shape:

```json
{
  "interval": "month",
  "value": 1
}
```

## 1. Get KPI Summary

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-analytics/kpis`

### Purpose

Returns the KPI summary payload used by the Admin analytics overview cards.

### Query Parameters

Filters:
- `date_from?: string`
- `date_to?: string`
- `status?: string | string[]`
- `product_id?: string | string[]`
- `frequency?: string | string[]`
- `group_by?: "day" | "week" | "month"`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "filters": {
    "date_from": "2026-04-01T00:00:00.000Z",
    "date_to": "2026-04-30T23:59:59.999Z",
    "status": ["active", "past_due"],
    "product_id": ["prod_123"],
    "frequency": [
      {
        "interval": "month",
        "value": 1
      }
    ],
    "group_by": "day"
  },
  "metrics_version": "analytics-v1",
  "generated_at": "2026-05-01T10:00:00.000Z",
  "kpis": [
    {
      "key": "mrr",
      "label": "MRR",
      "value": 2480,
      "unit": "currency",
      "currency_code": "usd",
      "precision": 2,
      "previous_value": 2310,
      "delta_value": 170,
      "delta_percentage": 7.36
    },
    {
      "key": "churn_rate",
      "label": "Churn Rate",
      "value": 3.2,
      "unit": "percentage",
      "currency_code": null,
      "precision": 2,
      "previous_value": 4.1,
      "delta_value": -0.9,
      "delta_percentage": -21.95
    },
    {
      "key": "ltv",
      "label": "LTV",
      "value": 412,
      "unit": "currency",
      "currency_code": "usd",
      "precision": 2,
      "previous_value": 398,
      "delta_value": 14,
      "delta_percentage": 3.52
    },
    {
      "key": "active_subscriptions_count",
      "label": "Active Subscriptions",
      "value": 182,
      "unit": "count",
      "currency_code": null,
      "precision": 0,
      "previous_value": 176,
      "delta_value": 6,
      "delta_percentage": 3.41
    }
  ]
}
```

### Response Rules

- `value` may be `null` if a metric is not computable for the selected filter range.
- `currency_code` is only populated for currency-based metrics.
- `precision` tells the Admin UI how to format the value.
- the response always includes all supported KPI keys for MVP, even when some values are `null`
- `MRR` and `LTV` may resolve to `null` when the selected dataset doesn't have a single valid currency context or when the revenue snapshot is incomplete for MVP calculation

### Common Errors

- `400 invalid_data`
  Invalid filter shape, unsupported grouping value, or invalid frequency token.

## 2. Get Trend Series

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-analytics/trends`

### Purpose

Returns grouped time-series data used by the Admin analytics chart.

### Query Parameters

Filters:
- `date_from?: string`
- `date_to?: string`
- `status?: string | string[]`
- `product_id?: string | string[]`
- `frequency?: string | string[]`
- `group_by?: "day" | "week" | "month"`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "filters": {
    "date_from": "2026-04-01T00:00:00.000Z",
    "date_to": "2026-04-30T23:59:59.999Z",
    "status": ["active"],
    "product_id": [],
    "frequency": [],
    "group_by": "week"
  },
  "metrics_version": "analytics-v1",
  "generated_at": "2026-05-01T10:00:00.000Z",
  "series": [
    {
      "metric": "mrr",
      "label": "MRR",
      "unit": "currency",
      "currency_code": "usd",
      "precision": 2,
      "points": [
        {
          "bucket_start": "2026-03-30T00:00:00.000Z",
          "bucket_end": "2026-04-05T23:59:59.999Z",
          "value": 2280
        },
        {
          "bucket_start": "2026-04-06T00:00:00.000Z",
          "bucket_end": "2026-04-12T23:59:59.999Z",
          "value": 2330
        }
      ]
    },
    {
      "metric": "active_subscriptions_count",
      "label": "Active Subscriptions",
      "unit": "count",
      "currency_code": null,
      "precision": 0,
      "points": [
        {
          "bucket_start": "2026-03-30T00:00:00.000Z",
          "bucket_end": "2026-04-05T23:59:59.999Z",
          "value": 174
        },
        {
          "bucket_start": "2026-04-06T00:00:00.000Z",
          "bucket_end": "2026-04-12T23:59:59.999Z",
          "value": 178
        }
      ]
    }
  ]
}
```

### Response Rules

- each series is grouped according to the requested `group_by`
- `bucket_start` and `bucket_end` define the exact time window for each point
- points are ordered ascending by `bucket_start`
- series may contain `value = null` when the bucket exists but the metric cannot be computed
- bucket semantics use `UTC` in MVP
- `MRR` and `LTV` series may contain `value = null` for buckets where no valid single-currency revenue snapshot is available

### Common Errors

- `400 invalid_data`
  Invalid filter shape, unsupported grouping value, or invalid frequency token.

## 3. Export Analytics Report

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-analytics/export`

### Purpose

Returns an export payload aligned with the active analytics filters.

For MVP, the export contract is synchronous and supports `csv` and `json`.

### Query Parameters

Filters:
- `date_from?: string`
- `date_to?: string`
- `status?: string | string[]`
- `product_id?: string | string[]`
- `frequency?: string | string[]`
- `group_by?: "day" | "week" | "month"`

Format:
- `format?: "csv" | "json"`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "format": "json",
  "filters": {
    "date_from": "2026-04-01T00:00:00.000Z",
    "date_to": "2026-04-30T23:59:59.999Z",
    "status": ["active"],
    "product_id": [],
    "frequency": [],
    "group_by": "month"
  },
  "metrics_version": "analytics-v1",
  "generated_at": "2026-05-01T10:00:00.000Z",
  "file_name": "subscription-analytics-2026-05-01.json",
  "content_type": "application/json",
  "columns": [
    "bucket_start",
    "bucket_end",
    "mrr",
    "churn_rate",
    "ltv",
    "active_subscriptions_count"
  ],
  "rows": [
    {
      "bucket_start": "2026-04-01T00:00:00.000Z",
      "bucket_end": "2026-04-30T23:59:59.999Z",
      "mrr": 2480,
      "churn_rate": 3.2,
      "ltv": 412,
      "active_subscriptions_count": 182
    }
  ]
}
```

### Response Rules

- the export response echoes the resolved filters
- the export response includes `metrics_version`
- `columns` are deterministic and define the flattened export order
- `rows` represent the export-ready flattened dataset
- for `csv`, the server still returns export metadata and flattened rows under the same logical contract
- a future async-export implementation may replace this route contract with a workflow-backed export transaction
- `MRR` and `LTV` export cells may be `null` when the underlying bucket does not have a valid single-currency revenue basis

### Common Errors

- `400 invalid_data`
  Invalid filter shape, unsupported grouping value, unsupported export format, or invalid frequency token.

## 4. Manual Rebuild

### Endpoint

- Method: `POST`
- Path: `/admin/subscription-analytics/rebuild`

### Purpose

Triggers a manual rebuild of daily analytics snapshots for a historical range.

This route does not use a separate rebuild engine.

It reuses the same shared analytics rebuild workflow used by:
- the scheduled analytics job
- incremental analytics follow-up runs

### Request Body

```json
{
  "date_from": "2026-04-01T00:00:00.000Z",
  "date_to": "2026-04-30T23:59:59.999Z",
  "reason": "historical backfill after metrics review"
}
```

### Validation Rules

- `date_from <= date_to`
- maximum manual rebuild window is `365` days

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "date_from": "2026-04-01T00:00:00.000Z",
  "date_to": "2026-04-30T23:59:59.999Z",
  "processed_days": 30,
  "processed_subscriptions": 1240,
  "upserted_rows": 1240,
  "skipped_rows": 0,
  "blocked_days": [],
  "failed_days": []
}
```

### Response Rules

- partial failure does not automatically change the HTTP status to `500`
- `blocked_days` and `failed_days` are surfaced in the response summary
- rerunning the same range is expected and supported because rebuild is day-level idempotent

### Common Errors

- `400 invalid_data`
  Invalid request body or window larger than the supported manual rebuild limit.
