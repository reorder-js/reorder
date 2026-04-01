# Cancellation & Retention Architecture

This document describes the current runtime architecture of the `Cancellation & Retention` area in the `Reorder` plugin.

It focuses on the implemented system, not on the original design-only plan.

## Goal

The `Cancellation & Retention` area provides an operator-managed churn handling flow for recurring subscriptions.

The current implementation supports:
- tracking `cancellation_case` and `retention_offer_event`
- starting and continuing a cancellation case for eligible subscriptions
- evaluating retention recommendation paths through `smart-cancellation`
- applying pause, discount, and bonus retention offers
- finalizing cancellation with required churn reason data
- Admin list and detail views nested under `Subscriptions`
- integration with `Subscriptions`, `Renewals`, and `Dunning`
- operational hardening through audit trails, structured logs, and scheduler summary metrics

## Architectural Overview

The implementation is split into five main layers:

1. domain module
2. workflows
3. admin API
4. admin UI
5. observability and scheduled job

Each layer has a clear responsibility:

- the domain module owns `cancellation_case` and `retention_offer_event`
- workflows own case creation, recommendation, offer application, cancellation finalization, and reason updates
- the admin API exposes read and mutation routes for operators
- the admin UI renders the queue and case detail views and calls the Admin endpoints
- the scheduler job computes operational metrics and emits structured logs for alertable churn spikes

## 1. Domain Module

The `cancellation` custom module is the owner of churn handling and retention-process state.

It contains:
- domain types
- the `cancellation_case` data model
- the `retention_offer_event` data model
- the module service
- read-model utilities for Admin list and detail
- smart-cancellation, audit, error, observability, and operational-metrics helpers

Key design choices:
- one `CancellationCase` is anchored to one `subscription_id`
- one subscription may have many historical cases, but only one active case at a time in MVP
- recommendation state lives on the case aggregate
- concrete retention actions are stored separately as append-only `RetentionOfferEvent`
- `Subscription` remains the source of lifecycle state, while `CancellationCase` remains the source of cancellation and retention process state

## 2. Data Model

The `cancellation_case` model stores:
- aggregate identity and ownership fields
- process status
- churn reason and normalized category
- operator notes
- recommendation state
- final outcome summary
- cancellation-effective summary
- audit summary and metadata

Core `cancellation_case` fields include:
- `id`
- `subscription_id`
- `status`
- `reason`
- `reason_category`
- `notes`
- `recommended_action`
- `final_outcome`
- `finalized_at`
- `finalized_by`
- `cancellation_effective_at`
- `metadata`

The `retention_offer_event` model stores:
- `id`
- `cancellation_case_id`
- `offer_type`
- `offer_payload`
- `decision_status`
- `decision_reason`
- `decided_at`
- `decided_by`
- `applied_at`
- `metadata`

### Indexing Strategy

The current migrations and model setup optimize `Cancellation & Retention` for:
- lookup by `subscription_id`
- filtering by `status`
- filtering by `final_outcome`
- filtering by `reason_category`
- ordering by `created_at`
- offer history lookup by `cancellation_case_id`
- offer filtering by `offer_type`
- offer filtering by `decision_status`

## 3. Integration and Ownership Semantics

`Cancellation & Retention` is integrated with `Subscriptions`, `Renewals`, and `Dunning` in the current runtime.

The current implementation follows these rules:
- a cancellation case can be opened only for subscriptions in `active`, `paused`, or `past_due`
- `cancelled` subscriptions cannot open a new cancellation case
- `smart-cancellation` stores recommendation state on the case, not on the subscription
- applying a `pause_offer` moves the subscription into `paused`
- applying a `discount_offer` or `bonus_offer` keeps the subscription active and closes the case as `retained`
- final cancel moves the subscription into `cancelled`, sets `cancel_effective_at`, and clears `next_renewal_at`
- active `DunningCase` may coexist with active `CancellationCase`
- `Renewals` remain the owner of `RenewalCycle`, while cancellation affects renewal eligibility through subscription lifecycle state

This means:
- `CancellationCase` owns churn process state
- `RetentionOfferEvent` owns offer history
- `Subscription` owns lifecycle materialization
- `Renewals` own cycle execution history
- `Dunning` owns payment recovery state

## 4. Module Link Boundary

The current implementation defines one primary cross-module link:

- `cancellationCase <-> subscription`

Implementation file:
- `src/links/cancellation-subscription.ts`

The runtime also persists `subscription_id` directly on `CancellationCase`.

Why both exist:
- `subscription_id` supports indexing, filtering, and invariant checks
- the module link supports Medusa-style linked reads without moving ownership out of the cancellation module

Current runtime does not define direct links from `CancellationCase` to:
- `renewal_cycle`
- `dunning_case`

Those summaries are resolved by query-time enrichment from `subscription_id`.

## 5. Read Path

The read path is optimized for the Admin cancellation queue and case detail.

Main components:
- admin route handlers under `src/api/admin/cancellations`
- normalization and DTO mapping helpers in `src/api/admin/cancellations/utils.ts`
- query helpers in `src/modules/cancellation/utils/admin-query.ts`

### Queue Flow

For the queue view:
1. the Admin UI sends query params to `GET /admin/cancellations`
2. the route validates and normalizes query input
3. `listAdminCancellationCases(...)` applies filters, sorting, pagination, and linked summary enrichment
4. the query layer reads `cancellation_case`
5. optional offer-type filtering is resolved through `retention_offer_event`
6. the response is mapped to Admin DTOs used by the DataTable

The current queue supports:
- pagination
- search
- filtering
- sorting
- linked `subscription` summary
- optional `offer_type` filtering through offer history

### Detail Flow

For the detail view:
1. the Admin UI requests `GET /admin/cancellations/:id`
2. the route resolves the case through the detail query helper
3. linked subscription summary is resolved
4. optional dunning and renewal summaries are resolved from `subscription_id`
5. full offer history is mapped into the detail DTO

The detail payload represents:
- the case aggregate
- linked subscription summary
- linked dunning summary
- linked renewal summary
- offer history
- metadata

### Query Boundary Note

In the current runtime, `Cancellation & Retention` Admin reads use `CancellationCase` as the source query root.

This means:
- `CancellationCase` remains the source-of-truth query root
- `RetentionOfferEvent` remains same-module child history
- `subscription` is the main linked enrichment
- `dunning` and `renewal` summaries are query-time context only

## 6. Write Path

All state-changing cancellation operations are routed through workflows.

Implemented mutations:
- start cancellation case
- smart cancellation recommendation
- apply retention offer
- finalize cancellation
- update cancellation reason

Write path pattern:
1. the Admin route submits workflow input
2. the workflow validates the current case and subscription state
3. the workflow applies recommendation, offer, or finalization logic
4. the route returns the refreshed cancellation detail payload for Admin mutations

This keeps business logic out of routes and centralizes mutation rules in workflows.

## 7. Workflows

The current mutation layer is built around:
- `start-cancellation-case`
- `smart-cancellation`
- `apply-retention-offer`
- `finalize-cancellation`
- `update-cancellation-reason`

### Start Workflow

`start-cancellation-case` is the entry workflow for operator-managed churn handling.

It is responsible for:
- validating that the subscription is eligible for a case
- enforcing the single-active-case-per-subscription invariant
- creating a new case or updating the active one
- storing initial reason, category, notes, and entry context

### Recommendation Workflow

`smart-cancellation` is the recommendation workflow for active cases.

It is responsible for:
- validating that the case is active
- loading subscription and dunning context
- determining eligible actions
- selecting a recommended action
- updating case status to `evaluating_retention`
- storing rationale and recommendation snapshot in metadata

### Offer Workflow

`apply-retention-offer` is the materialization workflow for retention actions.

It is responsible for:
- validating that the case is active
- validating the offer payload and policy
- creating `RetentionOfferEvent`
- applying `pause_offer`, `discount_offer`, or `bonus_offer`
- updating subscription lifecycle or metadata effect as needed
- closing the case as `paused` or `retained`

### Finalize Workflow

`finalize-cancellation` is the final cancel mutation.

It is responsible for:
- validating that the case is active
- requiring a churn reason
- computing `cancel_effective_at`
- updating the subscription to `cancelled`
- clearing `next_renewal_at`
- calling `ensure-next-renewal-cycle`
- closing the case as `canceled`

### Reason Workflow

`update-cancellation-reason` is the manual metadata and classification mutation.

It is responsible for:
- updating `reason`
- updating `reason_category`
- updating `notes`
- recording who changed the churn classification and why

## 8. Admin API Architecture

The Admin API exposes custom routes dedicated to the `Cancellation & Retention` pages.

Implemented read routes:
- `GET /admin/cancellations`
- `GET /admin/cancellations/:id`

Implemented mutation routes:
- `POST /admin/cancellations/:id/smart-cancel`
- `POST /admin/cancellations/:id/apply-offer`
- `POST /admin/cancellations/:id/finalize`
- `POST /admin/cancellations/:id/reason`

The API layer uses:
- Zod validators
- authenticated admin requests
- query helpers for reads
- workflows for writes
- domain-aware error mapping

## 9. Admin UI Architecture

The Admin UI is implemented as custom Medusa Admin routes nested under `Subscriptions`.

Current screens:
- cancellation queue page
- cancellation detail page

### Queue Page

The queue page is built with Medusa `DataTable`.

It supports:
- pagination
- search
- filters
- sorting
- row navigation to detail

Filters include:
- `reason_category`
- `final_outcome`
- `offer_type`
- created date range

The queue uses the same filter-toolbar pattern as `Renewals`:
- `Add filter`
- `Clear all`
- dedicated date inputs not rendered as chips

### Detail Page

The detail page contains:
- case overview
- subscription summary
- dunning summary
- renewal summary
- smart-cancellation summary
- decision timeline
- offer history
- metadata
- action menu and drawers for manual actions

It provides three Drawer-backed edit flows:
- apply offer
- update reason
- finalize cancellation

It also provides confirm prompts for risky actions:
- smart cancellation
- apply offer
- pause offer
- finalize cancellation

## 10. Data Loading and Query Invalidation

The Admin UI follows the Medusa display-query pattern.

Implemented behavior:
- the queue display query loads on mount
- the detail display query loads on mount
- action drawers use their own form query
- successful mutations invalidate queue, detail, and form query keys
- display queries do not depend on drawer or modal UI state

Implementation detail:
- data-loading lives in `src/admin/routes/subscriptions/cancellations/data-loading.ts`
- shared invalidation refreshes queue, detail, action-form, and prepared analytics keys

## 11. Audit and Operational Hardening

The current implementation records operational audit in two ways:

- explicit fields such as `finalized_by`, `decided_by`, and workflow-specific actor fields
- append-only `manual_actions` metadata entries with `who / when / why / data`

This gives:
- operator traceability for risky actions
- case-level audit summary
- structured mutation history without creating a separate audit aggregate

## 12. Observability and Scheduled Metrics

`Cancellation & Retention` includes its own observability helpers and scheduler job.

Runtime files:
- `src/modules/cancellation/utils/observability.ts`
- `src/modules/cancellation/utils/operational-metrics.ts`
- `src/jobs/process-cancellation-operational-metrics.ts`

The scheduled job:
- runs every hour
- computes operational metrics for the recent time window
- logs structured summary metrics
- marks churn spikes per `reason_category` as `alertable`

Current tracked operational metrics include:
- `case_count`
- `terminal_case_count`
- `canceled_count`
- `retained_count`
- `pause_count`
- `churn_rate`
- `offer_acceptance_rate`
- `top_reason_categories`

This is currently implemented as structured logging rather than external monitoring integration.

## 13. Testing Strategy

The area is currently covered by:
- workflow integration tests
- admin HTTP integration tests
- scenario-based admin flow integration tests
- cross-module smoke integration tests

Important note:
- there is no browser E2E layer in the current plugin
- the main end-to-end operator flows are verified through Medusa-supported integration tests

## 14. Boundaries of Responsibility

`Cancellation & Retention` currently owns:
- cancellation case state
- retention recommendation state
- retention offer history
- churn reason classification
- operator-facing cancel and retention workflows
- operational metrics for churn handling

It does not own:
- subscription lifecycle as the primary source of truth
- renewal cycle execution history
- dunning retry and debt recovery state
- global plan-offer policy configuration

The module coordinates with those domains through:
- workflow-driven mutation effects
- linked and query-enriched reads
- explicit ownership boundaries rather than shared aggregate state
