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
