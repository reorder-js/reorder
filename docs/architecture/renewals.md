# Renewals Architecture

This document describes the current architecture of the `Renewals` area in the `Reorder` plugin.

It focuses on the implemented system, not on the initial design assumptions.

## Goal

The `Renewals` area provides the execution and operational review layer for recurring subscription billing.

The current implementation supports:
- tracking renewal cycles and renewal attempts
- scheduled processing through a Medusa job
- manual force execution from Admin
- approval and rejection of pending subscription changes before renewal
- Admin queue and detail views for renewal operations
- integration with `Subscriptions` and `Plans & Offers`
- integration with `Dunning` for payment-qualified renewal failures
- operational hardening through workflow locking, correlation IDs, structured logs, and scheduler summary metrics

## Architectural Overview

The implementation is split into four main layers:

1. domain module
2. workflows and scheduled job
3. admin API
4. admin UI

Each layer has a clear responsibility:

- the domain module owns `renewal_cycle` and `renewal_attempt`
- workflows own execution, approval, rejection, and force-run mutations
- the scheduled job discovers due cycles and triggers the shared execution workflow
- the admin API exposes read and mutation routes for operational users
- the admin UI renders the queue and detail views and calls the Admin endpoints

## 1. Domain Module

The `renewal` custom module is the owner of the renewal execution domain.

It contains:
- domain types
- the `renewal_cycle` data model
- the `renewal_attempt` data model
- the module service
- read-model utilities for Admin queue, detail, and scheduler reads

Key design choices:
- one renewal cycle represents one concrete due renewal unit for one subscription
- attempt history is stored separately from the cycle aggregate
- the cycle stores operational state and selected execution summary fields directly
- the subscription remains the source of active subscribed state, while the cycle remains the source of execution history

## 2. Data Model

The `renewal_cycle` model stores:
- identity and scheduling fields
- execution status
- approval state
- generated order reference
- last error summary
- applied pending change snapshot
- attempt counter and metadata

Core `renewal_cycle` fields include:
- `id`
- `subscription_id`
- `scheduled_for`
- `processed_at`
- `status`
- `approval_required`
- `approval_status`
- `approval_decided_at`
- `approval_decided_by`
- `approval_reason`
- `generated_order_id`
- `applied_pending_update_data`
- `last_error`
- `attempt_count`
- `metadata`

The `renewal_attempt` model stores:
- `id`
- `renewal_cycle_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`
- `order_id`
- `metadata`

### Indexing Strategy

The current migrations and model setup optimize the renewal queue for:
- lookup by `subscription_id`
- filtering by `status`
- filtering and ordering by `scheduled_for`
- Admin filtering and sorting by operational fields
- attempt history lookup by `renewal_cycle_id`

## 3. Execution Semantics

`Renewals` use the subscription as the source of current operational state and optionally apply approved `pending_update_data` during execution.

The current implementation follows these rules:
- only eligible subscriptions may renew
- pending changes are only considered when they are effective for the cycle date
- approval is enforced when the cycle requires it
- `Plans & Offers` are re-resolved at execution time before pending changes are applied
- successful execution updates the subscription’s active cadence and clears applied `pending_update_data`
- the cycle records whether pending changes were actually applied

This means:
- `Subscriptions` own active subscription state
- `Plans & Offers` own current policy validation
- `Renewals` own execution state and outcome history

## 4. Read Path

The read path is optimized for the Admin renewal queue and cycle detail.

Main components:
- admin route handlers under `src/api/admin/renewals`
- normalization helpers in `src/api/admin/renewals/utils.ts`
- query helpers in `src/modules/renewal/utils/admin-query.ts`
- scheduler-specific query helper in `src/modules/renewal/utils/scheduler-query.ts`

### Queue Flow

For the queue view:
1. the Admin UI sends query params to `GET /admin/renewals`
2. the route validates and normalizes query input
3. `listAdminRenewals(...)` applies filters, sorting, pagination, and linked summary resolution
4. the query layer reads renewal cycles and latest attempts
5. the response is mapped to Admin DTOs used by the queue DataTable

Supported queue capabilities include:
- pagination
- search
- filtering
- sorting
- latest-attempt summary resolution

### Detail Flow

For the detail view:
1. the Admin UI requests `GET /admin/renewals/:id`
2. the route resolves the cycle through the detail query helper
3. linked subscription and generated-order summaries are resolved
4. attempt history and pending-change summary are mapped into the detail DTO

The detail payload represents:
- the cycle aggregate
- approval summary
- linked subscription summary
- linked order summary
- pending changes
- attempt history
- metadata

### Scheduler Read Flow

The scheduled job uses a dedicated scheduler query rather than the Admin read model.

It selects due cycles by:
- `status in [scheduled, failed]`
- `scheduled_for <= now`
- approval-eligible state when approval is required

This keeps scheduler discovery lightweight and separate from Admin display concerns.

## 5. Write Path

All state-changing renewal operations are routed through workflows.

Implemented mutations:
- process renewal cycle
- force renewal cycle
- approve renewal changes
- reject renewal changes

Write path pattern:
1. the scheduler or Admin route submits a workflow input
2. the workflow validates the current cycle and subscription state
3. the workflow applies execution or decision logic
4. the route returns the refreshed renewal detail payload for Admin mutations

This keeps business logic out of routes and centralizes mutation rules in workflows.

## 6. Workflows

The current renewal mutation layer is built around:
- `process-renewal-cycle`
- `force-renewal-cycle`
- `approve-renewal-changes`
- `reject-renewal-changes`

### Core Execution Workflow

`process-renewal-cycle` is the shared execution workflow used by:
- the scheduler job
- manual `force renewal`

It is responsible for:
- validating concurrency and state
- validating subscription eligibility
- validating approval requirements
- re-validating `Plans & Offers` policy for pending changes
- creating the renewal attempt
- updating cycle status
- creating the renewal order when applicable
- starting `Dunning` when payment-qualified renewal failures happen after order creation
- updating subscription cadence and snapshots
- recording success or failure

Current implementation detail:
- the workflow acquires a Medusa workflow lock with key `renewal:${renewal_cycle_id}`
- the current lock settings are `timeout = 10` seconds and `ttl = 120` seconds
- this shared lock protects both scheduler execution and manual force execution

### Approval Workflows

`approve-renewal-changes` and `reject-renewal-changes` are the mutation boundary for approval decisions.

They are responsible for:
- validating that approval is required
- blocking duplicate decisions
- storing who decided, when, and why
- updating the cycle approval state

### Force Workflow

`force-renewal-cycle` is the Admin-facing operational mutation.

It is responsible for:
- validating that the cycle can be manually forced
- enforcing approval requirements before force-run
- delegating actual execution to the shared core renewal workflow
- attaching a manual-operation correlation ID used by structured operational logging

## 7. Scheduled Processing

`Renewals` are processed by the scheduled job:

- `src/jobs/process-renewal-cycles.ts`

The job:
- runs every five minutes
- discovers due cycles in batches
- executes the shared renewal workflow for each cycle
- logs per-cycle outcomes
- emits a structured run summary with counters and duration

The scheduler does not implement a separate business flow. It reuses the same core execution logic as manual force.

## 8. Concurrency and Operational Hardening

The renewal execution workflow already uses Medusa workflow locking around the critical execution path.

Current hardening includes:
- lock key based on `renewal_cycle_id`
- anti-duplication through state validation
- structured operational logging
- generated correlation IDs for scheduler and manual force flows
- per-cycle and per-job outcome logging
- summary counters for:
  - success count
  - failure count
  - blocked count
  - processing duration

Alert-oriented log classification currently distinguishes between:
- already processing
- duplicate execution
- subscription not eligible
- approval blocked
- offer policy blocked
- order creation failure
- unexpected runtime failure

Operational implementation note:
- structured renewal observability lives in `src/modules/renewal/utils/observability.ts`
- the scheduler job logs per-run and per-cycle summaries
- the core execution step and manual force flow emit correlation-aware operational events

## 9. Admin API Architecture

The Admin API exposes custom routes dedicated to renewal monitoring and operational actions.

Implemented read routes:
- `GET /admin/renewals`
- `GET /admin/renewals/:id`

Implemented mutation routes:
- `POST /admin/renewals/:id/force`
- `POST /admin/renewals/:id/approve-changes`
- `POST /admin/renewals/:id/reject-changes`

The API layer uses:
- Zod validators
- authenticated admin requests
- query helpers for reads
- workflows for mutations

## 10. Admin UI Architecture

The Admin UI is implemented as custom Medusa Admin routes nested under `Subscriptions`.

Current screens:
- renewals queue page
- renewal cycle detail page

### Queue Page

The queue page is built with Medusa `DataTable`.

It supports:
- pagination
- search
- filters
- sorting
- row navigation to detail
- default scheduled date range on mount

Implemented route file:
- `src/admin/routes/subscriptions/renewals/page.tsx`

### Detail Page

The detail page contains:
- cycle overview
- approval summary
- subscription summary
- generated order summary
- pending changes
- attempt history
- technical metadata
- action menu with `force`, `approve`, and `reject`

Decision flows use Drawers and confirm prompts in the standard Medusa style.

Implemented route file:
- `src/admin/routes/subscriptions/renewals/[id]/page.tsx`

## 11. Query Invalidation Strategy

The Admin UI uses explicit invalidation for renewal list and detail queries.

After a successful mutation:
- the renewals list query is invalidated
- the renewal detail query is invalidated

This keeps queue state and detail state synchronized after operator actions.

Implementation detail:
- list and detail display queries are centralized in `src/admin/routes/subscriptions/renewals/data-loading.ts`
- invalidation is shared through `invalidateAdminRenewalsQueries(...)`
- approval drawers use local form state and already-loaded detail data rather than a separate remote display query

## 12. Error and Loading Handling

The `Renewals` UI follows Medusa-style state handling:
- the queue uses DataTable loading and empty states
- the detail page shows explicit loading and error states
- decision drawers show local loading and inline error states
- risky actions require operator confirmation

This keeps display data separate from drawer-only form state and matches the existing Admin UX patterns used elsewhere in the plugin.

## 13. Testing Strategy

`Renewals` are protected through:
- module integration tests
- HTTP integration tests for query helpers, workflows, and routes
- an Admin flow integration test
- a smoke-level integration test against `Subscriptions` and `Plans & Offers`

Implemented test files:
- `src/modules/renewal/__tests__/service.spec.ts`
- `integration-tests/http/renewals-workflows.spec.ts`
- `integration-tests/http/renewals-routes.spec.ts`
- `integration-tests/http/renewals-admin-flow.spec.ts`
- `integration-tests/http/renewals-smoke.spec.ts`

Related documents:
- [Admin Renewals API](../api/admin-renewals.md)
- [Admin Renewals UI](../admin/renewals.md)
- [Renewals Testing](../testing/renewals.md)
- [Renewals Specs](../specs/renewals/admin-spec.md)
