# Analytics Architecture

This document describes the intended architectural boundary for the `Analytics` area in the `Reorder` plugin.

It is the runtime source of truth for:
- ownership and source-of-truth rules
- analytics read-model boundaries
- relations to existing recurring-commerce modules
- daily snapshot and aggregation semantics

## Goal

The `Analytics` area provides operator-facing reporting and KPI views for recurring commerce in Admin.

Its purpose is to:
- expose stable KPI values such as `MRR`, `churn_rate`, `ltv`, and `active_subscriptions_count`
- expose time-based trends for operational and business review
- support filtering, grouping, and export in Admin
- provide a fast read-oriented analytics layer without changing domain ownership in the plugin

Its purpose is not to replace the source modules that already own subscription, renewal, cancellation, or audit state.

## Architectural Role

`Analytics` is a derived, read-oriented reporting layer.

It should aggregate and precompute reporting data from the recurring-commerce domains implemented in the plugin.

The key architectural decision is:

- `Analytics` is not the source of truth for business state.
- `Analytics` is the source of truth only for its own derived read models, daily snapshots, and aggregated KPI outputs.

This means the area owns reporting outputs, but it does not own the underlying lifecycle or process state from which those outputs are derived.

## Ownership Boundaries

The current ownership model of the plugin remains unchanged.

`Subscriptions` remain the source of truth for:
- subscription lifecycle state
- active versus inactive subscription status
- cadence and billing-frequency fields
- `next_renewal_at`
- `cancel_effective_at`
- product, customer, pricing, and shipping snapshots persisted on the subscription
- the operational base used for active-subscription counting and MRR-oriented subscription value calculations

`Plans & Offers` remain the source of truth for:
- subscription offer policy
- allowed frequencies
- discount rules
- effective-offer validation rules

`Plans & Offers` are not the source of truth for reporting totals.
They may provide classification or explanatory context, but they do not own KPI outputs.

`Renewals` remain the source of truth for:
- renewal execution history
- renewal attempt history
- approval outcomes
- success and failure execution results

`Renewals` may contribute facts used by analytics, but they remain the owner of execution history.

`Dunning` remains the source of truth for:
- payment recovery state
- retry schedule
- retry attempt history
- recovered and unrecovered outcomes

`Dunning` may later support recovery-oriented reporting, but it does not own core subscription KPI outputs in MVP.

`Cancellation & Retention` remain the source of truth for:
- cancellation process state
- churn reason and normalized category
- retention recommendation state
- retention offer history
- final cancellation and retention outcomes

This area is the primary source for churn-oriented reporting inputs.

`Activity Log` remains the source of truth for:
- append-only business audit events around subscription operations

However:
- `Activity Log` is not the primary source for KPI calculations
- `Activity Log` is an audit and investigation layer, not the canonical analytical fact table for business reporting

## Source-of-Truth Rules

The `Analytics` area follows these source-of-truth rules:

- KPI inputs should be read from the domain module that owns the business fact.
- Derived trend buckets and daily aggregates should be persisted by `Analytics`.
- `Analytics` must not redefine business ownership that belongs to another module.
- `Analytics` must not use `Activity Log` as the primary source for core KPI calculations when the fact already exists in an owning module.
- `Analytics` may use audit data only as a fallback, audit aid, or validation aid, not as the default reporting source.

### Primary Source Mapping

For MVP, the primary source mapping is:

- `active_subscriptions_count`
  - primary source: `Subscriptions`
- `MRR`
  - primary source: `Subscriptions`
  - based on active subscriptions and their persisted pricing and cadence snapshots
- `churn_rate`
  - primary source: `Cancellation & Retention`
  - denominator may depend on active subscription base derived from `Subscriptions`
- `LTV`
  - primary source: derived by `Analytics`
  - built from source facts owned by `Subscriptions`, `Renewals`, and possibly `Cancellation & Retention`, depending on the final business definition

## Business Definitions and Calculation Semantics

The `Analytics` area uses explicit MVP business definitions rather than inferred reporting logic.

This keeps the reporting layer stable and makes later implementation tradeoffs visible.

### Active Subscription Semantics

For analytics purposes, `active` means:
- `subscription.status = active`

This means:
- `paused` subscriptions are not part of the active recurring base
- `past_due` subscriptions are not part of the active recurring base
- `cancelled` subscriptions are not part of the active recurring base

`active_subscriptions_count` is therefore the count of subscriptions whose current lifecycle state is exactly `active`.

### MRR Semantics

For MVP, `MRR` means:
- the monthly-normalized recurring value of active subscriptions

However, the current plugin does not yet persist a complete recurring monetary snapshot directly on the subscription aggregate.

Current runtime state:
- `Subscriptions` own cadence and lifecycle state
- `subscription.pricing_snapshot` stores discount context, not a full recurring charge amount
- renewal execution flows can resolve `order.total`
- renewal execution flows can resolve `cart.currency_code`

Because of that, the canonical recurring monetary input for `MRR` in MVP must come from:
- analytics-owned derived monetary snapshots built from renewal and order facts

This means:
- `Subscriptions` remain the owner of active-base and cadence semantics
- `Analytics` owns the derived recurring monetary read model used for reporting

If no valid monetary snapshot exists for a subscription, that subscription does not contribute to `MRR`.

### Churn Rate Semantics

For MVP, `churn_rate` means:
- canceled subscriptions in the reporting period divided by the active subscription base for the same period

Numerator:
- subscriptions whose final cancellation outcome is `canceled`
- bucket assignment uses `finalized_at`
- if `finalized_at` is missing, fallback may use `cancellation_effective_at`

Denominator:
- average daily active subscription base for the same reporting period
- derived from daily analytics snapshots sourced from `Subscriptions`

This means:
- `retained` is not churn
- `paused` is not churn
- only final canceled outcomes contribute to churn

### LTV Semantics

For MVP, `LTV` means:
- `MRR / churn_rate`

Where:
- `churn_rate` is treated as a ratio in calculation, not as a formatted percentage string

If:
- `MRR` is unavailable
- or `churn_rate <= 0`

then:
- `LTV = null`

This is an intentional MVP definition and not a full customer-ledger lifetime value model.

### Date Range Semantics

Analytics date ranges follow these rules:
- `date_from` is inclusive
- `date_to` is inclusive
- KPI calculations operate on facts within the selected reporting period
- trend calculations operate on normalized bucket windows within the selected reporting period

### Bucket Semantics

Supported reporting buckets:
- `day`
- `week`
- `month`

Bucket rules:
- `day` is one calendar day
- `week` is Monday through Sunday
- `month` is the calendar month

Each point is defined by:
- `bucket_start`
- `bucket_end`

and represents the aggregate result for that exact bucket window.

### Timezone Semantics

For MVP, the canonical analytics timezone is:
- `UTC`

This means:
- daily snapshots are generated in `UTC`
- day, week, and month bucket boundaries are computed in `UTC`
- Admin formatting may be localized later, but reporting semantics remain `UTC`

### Rounding Semantics

The reporting layer keeps working precision during computation and rounds only at the response boundary.

MVP display precision:
- `MRR`: `2`
- `churn_rate`: `2`
- `LTV`: `2`
- `active_subscriptions_count`: `0`

### Currency Semantics

MVP analytics assume one reporting currency per result set unless explicit normalization is introduced later.

This means:
- `MRR` and `LTV` are only valid when the underlying analytics revenue snapshot resolves to one currency context
- mixed-currency aggregation without normalization is not supported
- when the currency context is ambiguous, `MRR` and `LTV` should resolve to `null` rather than producing a misleading total

`churn_rate` and `active_subscriptions_count` are currency-independent.

## Direct Source Reads vs Daily Snapshots

The `Analytics` area distinguishes between:
- direct-source reads from owning domain modules
- persisted analytics snapshots and aggregates

### Direct-Source Reads

Direct reads from domain modules are used for:
- initial computation inputs
- rebuilding analytics history
- validating aggregation correctness
- small-scope recalculation when needed

These reads should come from the modules that own the underlying facts.

### Daily Snapshots

Daily snapshots are used for:
- KPI trend rendering in Admin
- historical bucket queries over larger date ranges
- stable export behavior
- faster repeated reads under filters and grouping

Daily snapshots are derived state.

They do not replace the owning modules.
They exist to provide:
- predictable query latency
- stable time-series behavior
- simpler Admin reporting APIs

## Data Layer and Module Ownership

The `Analytics` area should be implemented as a dedicated custom module in the plugin.

Recommended module structure:
- `src/modules/analytics/models/*`
- `src/modules/analytics/service.ts`
- `src/modules/analytics/index.ts`

The module follows the same Medusa pattern used by the existing plugin areas:
- domain data model lives in the module
- the module service owns CRUD access to analytics-owned tables
- workflows and jobs populate derived analytics data
- Admin API routes read from analytics-owned snapshots and aggregates

### Ownership Boundary

The `analytics` module owns:
- daily analytics snapshots
- reporting-oriented derived facts
- read-optimized aggregate outputs exposed to Admin

The `analytics` module does not own:
- subscription lifecycle state
- renewal execution state
- cancellation process state
- audit event ownership

This means the module is a reporting domain, not an operational domain.

## Recommended MVP Data Model

For MVP, the recommended primary model is:
- `subscription_metrics_daily`

This model should be the canonical analytics snapshot table used by KPI queries, trend queries, and exports.

### Why a Daily Snapshot Model

The current plugin already separates:
- source modules that own business facts
- read paths optimized for Admin
- scheduler and workflow logic that derives operational outputs

The same principle should apply here.

A daily analytics snapshot table provides:
- stable performance for Admin reads
- explicit rebuild semantics
- low coupling to source-module query shapes
- enough flexibility to aggregate by date, status, product, and cadence without re-reading the full operational graph for every request

### Why Not a Materialized View as the Primary MVP Model

For MVP, the analytics layer should not use a database materialized view as its primary source of truth.

Reasons:
- higher operational complexity
- refresh semantics introduce avoidable coupling to database-specific behavior
- rebuild and backfill become less explicit
- the plugin’s existing architecture favors Medusa-owned data models plus workflows/jobs over DB-specific reporting primitives

Materialized views may be introduced later if performance requires them.

For MVP:
- analytics-owned snapshot tables should be the primary persisted reporting layer
- query-time aggregation should happen in analytics read helpers or services

## `subscription_metrics_daily` Snapshot Semantics

`subscription_metrics_daily` should be a per-subscription, per-day analytics fact snapshot.

The recommended granularity is:
- one row per `subscription_id`
- per `metric_date`

This model is preferred over already-aggregated product/day rows because it preserves enough detail for:
- filtering by subscription dimensions
- reliable rebuilds and backfills
- future expansion of dimensions without redesigning the whole reporting layer

### Recommended Fields

The recommended MVP fields are:
- `id`
- `metric_date`
- `subscription_id`
- `customer_id`
- `product_id`
- `variant_id`
- `status`
- `frequency_interval`
- `frequency_value`
- `currency_code`
- `is_active`
- `active_subscriptions_count`
- `mrr_amount`
- `churned_subscriptions_count`
- `churn_reason_category`
- `source_snapshot`
- `metadata`

### Field Roles

`metric_date`
- the analytics day represented by the row
- normalized to `UTC`

`subscription_id`
- the subscription for which the snapshot was computed
- persisted to support idempotent rebuild and later reconciliation

`customer_id`
- optional reporting dimension

`product_id`, `variant_id`
- reporting dimensions used by filters and future segmentation

`status`
- the subscription lifecycle state for the represented day

`frequency_interval`, `frequency_value`
- cadence dimensions used by reporting filters

`currency_code`
- reporting currency context for money-based metrics
- nullable when revenue is not computable

`is_active`
- boolean marker derived from analytics-active semantics
- `true` only when the snapshot should contribute to active-base calculations

`active_subscriptions_count`
- `1` when the row contributes to active-subscription counting
- `0` otherwise

`mrr_amount`
- the monthly-normalized recurring revenue contribution of the subscription for that day
- nullable when no valid monetary snapshot exists

`churned_subscriptions_count`
- `1` only on the day the subscription contributes to churn numerator
- `0` otherwise

`churn_reason_category`
- populated only when the row contributes to churn-oriented reporting

`source_snapshot`
- compact JSON describing the reporting source basis used to compute the row
- may include stable references such as:
  - renewal identifiers
  - cancellation identifiers
  - resolved monetary-source hints

`metadata`
- extensible analytics-owned technical metadata

## Derived Metrics vs Persisted Facts

The analytics layer should persist reporting facts, not every final KPI as a stored field.

Persisted MVP facts should include:
- active-base contribution
- monthly-normalized revenue contribution
- churn contribution

Derived metrics such as `LTV` should be computed in the analytics read layer.

### `LTV` Handling

`LTV` should not be persisted as a canonical daily field in MVP.

Instead:
- `LTV` is derived at read time from persisted reporting facts
- the read layer computes it from the current `MRR` and `churn_rate` semantics

This keeps the snapshot model simpler and avoids locking the plugin too early into one persisted interpretation of `LTV`.

## Uniqueness and Rebuild Semantics

The daily snapshot model should support idempotent rebuilds.

Recommended logical uniqueness:
- `metric_date`
- `subscription_id`

This enables:
- safe day-level recalculation
- range rebuilds
- upsert-style snapshot replacement
- easier reconciliation against source domains

## Indexing Strategy

The snapshot model should be indexed for the future Admin analytics filters and trend queries.

Recommended single-field indexes:
- `metric_date`
- `subscription_id`
- `product_id`
- `status`
- `currency_code`
- `frequency_interval`
- `frequency_value`

Recommended composite indexes:
- `metric_date, status`
- `metric_date, product_id`
- `metric_date, frequency_interval, frequency_value`
- `metric_date, currency_code`
- `metric_date, churn_reason_category`

These indexes are aligned with the planned MVP filters:
- date range
- status
- product
- frequency
- grouping by day, week, or month

## Read Model Strategy

The Admin analytics read path should use `subscription_metrics_daily` as its reporting source.

This means:
- KPI queries aggregate persisted snapshot facts across the selected date range
- trend queries group persisted snapshot facts into `day`, `week`, and `month` buckets
- export queries flatten the same reporting source into export-ready rows

The Admin read path should not:
- compute analytics live from source modules on every request
- use `Activity Log` as its primary fact source
- depend on operational query helpers from unrelated modules for dashboard performance

## Relationship to Source Modules

The recommended data flow is:

1. source modules own the raw facts
2. analytics pipeline reads those facts
3. analytics module writes `subscription_metrics_daily`
4. Admin analytics routes read from the analytics snapshot layer

This preserves:
- source ownership
- Medusa module isolation
- predictable reporting behavior

## Reporting Boundary with Existing Modules

### Relation to `Subscriptions`

`Subscriptions` provide the operational baseline for reporting.

`Analytics` may derive:
- active counts
- status-distributed counts
- MRR-oriented subscription totals
- frequency-based segmentation

`Analytics` must not become the owner of lifecycle fields such as:
- `status`
- `next_renewal_at`
- `cancel_effective_at`

### Relation to `Renewals`

`Renewals` provide execution-history facts.

`Analytics` may derive:
- renewal success and failure trends
- execution volume trends
- revenue-adjacent or retention-adjacent supporting metrics if needed later

`Analytics` must not become the owner of:
- renewal cycle state
- attempt state
- approval state

### Relation to `Cancellation & Retention`

`Cancellation & Retention` provide churn-oriented facts.

`Analytics` may derive:
- churn rate
- cancellation trends
- top reason categories
- retained versus canceled outcome ratios

`Analytics` must not become the owner of:
- cancellation case status
- offer-decision state
- final cancellation process state

### Relation to `Activity Log`

`Activity Log` provides audit visibility, not KPI ownership.

`Analytics` may use `Activity Log` for:
- investigation
- reconciliation support
- future audit-driven validation

`Analytics` should not use `Activity Log` as the default source for:
- `MRR`
- active subscription counting
- churn calculation

## MVP Boundary Decision

For MVP, the `Analytics` area should follow this boundary:

- `Subscriptions` are the primary source for active-base and MRR calculations.
- `Cancellation & Retention` are the primary source for churn inputs and churn categorization.
- `Renewals` are a supporting source for historical execution facts where needed.
- `Activity Log` is excluded as a primary KPI source.
- `Analytics` owns daily snapshots, trend buckets, and Admin-facing aggregate outputs.

This gives the plugin:
- clear ownership boundaries
- stable performance characteristics
- compatibility with Medusa module isolation principles
- a reporting model that stays aligned with the already implemented domain architecture

## What `Analytics` Must Not Own

The `Analytics` area must not:
- become the canonical owner of subscription lifecycle state
- become the canonical owner of renewal-cycle outcomes
- become the canonical owner of cancellation-process state
- replace `Activity Log` as an audit layer
- store full duplicated copies of domain aggregates as its default model
- move business mutation logic out of workflows into reporting code

## Medusa Boundary Rules

This decision follows Medusa's modular architecture rules:

- source modules keep ownership of their own business state
- cross-module coordination happens through workflows and controlled read composition
- admin reporting is implemented through read models and API routes, not by transferring ownership across modules

For `Analytics`, this means:
- source facts come from owning modules
- snapshot creation is a reporting concern, not a business-ownership transfer
- Admin analytics routes should read from analytics snapshots and aggregates where possible
- rebuild and recomputation should be workflow-safe and operationally isolated from domain mutations
