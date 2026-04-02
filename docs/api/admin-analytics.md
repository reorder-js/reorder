# Admin Analytics API

This document describes the intended Admin API contract for the `Analytics` area of the `Reorder` plugin.

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

Notes:
- `date_from` and `date_to` are ISO-like timestamps or date strings interpreted by the API validator.
- `status` is a multi-value filter.
- `product_id` is a multi-value filter.
- `frequency` is a multi-value filter represented in requests using a serialized cadence token.
- `group_by` defaults to a server-defined value when omitted.

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
  "generated_at": "2026-05-01T10:00:00.000Z",
  "file_name": "subscription-analytics-2026-05-01.json",
  "content_type": "application/json",
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
- `rows` represent the export-ready flattened dataset
- for `csv`, the server still returns export metadata and flattened rows under the same logical contract
- a future async-export implementation may replace this route contract with a workflow-backed export transaction

### Common Errors

- `400 invalid_data`
  Invalid filter shape, unsupported grouping value, unsupported export format, or invalid frequency token.
