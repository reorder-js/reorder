# Admin UI: Analytics

This document describes the implemented Admin UI for the `Analytics` area in the `Reorder` plugin.

It focuses on:
- screen behavior
- filters and read flows
- export behavior
- loading and error states
- cache invalidation boundaries

## Purpose

The `Analytics` Admin UI gives operators a reporting-oriented dashboard for recurring-commerce KPIs and trends.

It is intended to support:
- quick KPI review
- trend inspection over time
- filtered reporting by status, product, and cadence
- export of the currently visible reporting slice

The UI is implemented as a Medusa Admin custom page nested under `Subscriptions`.

## Route Map

Implemented route:
- `/app/subscriptions/analytics`

Navigation behavior:
- the page is grouped under the `Subscriptions` Admin area
- it is a dedicated page, not a drawer or detail subpanel

## 1. Page Structure

### Main UI Elements

The page includes:
- page header and description
- filter bar
- KPI cards
- trend chart
- export action

The current layout follows the same Medusa Admin conventions as the other plugin pages:
- compact header
- content grouped in `Container` sections
- simple control density
- clear empty and error states

## 2. Filters

### Implemented Filters

The page currently supports:
- `date_from`
- `date_to`
- `status`
- `product_id`
- `frequency`
- `group_by`

### Filter Semantics

Current runtime behavior:
- filters drive both KPI and trend queries
- changing filters refreshes the displayed analytics data
- export uses the currently active filters
- `group_by` defaults to `day`
- timezone semantics are fixed to `UTC` in MVP

Frequency filters are represented as cadence tokens such as:
- `week:1`
- `month:1`
- `year:1`

## 3. KPI Cards

The page currently displays four KPI cards:
- `MRR`
- `Churn Rate`
- `LTV`
- `Active Subscriptions`

### Presentation Rules

- currency KPIs show currency-aware formatting when a valid single-currency dataset exists
- `MRR` and `LTV` may render as empty or fallback text when the selected dataset is mixed-currency or does not have a valid revenue basis
- count metrics use integer formatting
- percentage metrics use the configured KPI precision from the response payload

## 4. Trend Chart

The page displays a simple trend visualization sourced from the analytics trends endpoint.

Current behavior:
- the chart is driven by display queries loaded on mount
- metric selection changes which series is emphasized
- bucket semantics follow the selected `group_by`
- `day`, `week`, and `month` buckets all use `UTC`

The current UI intentionally keeps the chart lightweight and aligned with the existing Admin visual language.

## 5. Export

The Analytics page exposes an `Export` action with:
- `CSV`
- `JSON`

Current behavior:
- export is synchronous in MVP
- export is on demand and not preloaded
- export always uses the currently active filters
- the downloaded content uses the backend-provided deterministic column order and payload semantics

Export does not invalidate or reload the display queries by itself.

## 6. Data Loading

The page follows the Medusa Admin display-query pattern.

Current behavior:
- KPI data loads on mount
- trend data loads on mount
- export is a separate on-demand request
- display queries are keyed only by the resolved analytics filters
- display queries are not tied to unrelated local UI state

Implementation detail:
- page-level loading helpers live in `src/admin/routes/subscriptions/analytics/data-loading.ts`

## 7. Cache Invalidation

The Admin UI includes explicit analytics cache invalidation for mutations that can affect reporting.

Current invalidation integration exists for:
- subscription mutations
- renewal mutations
- cancellation mutations
- dunning mutations

This keeps the analytics dashboard aligned with the rest of the Admin surfaces after relevant changes.

## 8. UI States

### Loading

The page shows a loading state while KPI and trend queries are in flight.

### Empty

The page shows an explicit empty state when the selected filters produce no analytics data.

This is treated as a valid reporting outcome, not as an error.

### Error

The page shows an error state when KPI or trend queries fail.

Export errors are handled separately and do not replace the main dashboard state.

## 9. Current UX Boundaries

The current Analytics page intentionally does not include:
- compare-period UI
- saved views
- async export queueing
- anomaly annotations in the chart
- browser-based drill-down into individual snapshot rows

The implemented UX priorities are:
- consistency with existing Medusa Admin pages
- predictable filtered reporting
- fast access to KPI, trends, and export from one screen
