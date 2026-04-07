# Dunning Architecture

This document describes the current runtime architecture of the `Dunning` area in the `Reorder` plugin.

It focuses on the implemented system, not on the original design-only plan.

## Goal

The `Dunning` area provides payment recovery for qualifying failed renewal payments.

The current implementation supports:
- tracking `dunning_case` and `dunning_attempt`
- starting dunning from payment-qualified renewal failures
- scheduler-driven retry execution
- manual Admin actions for retry and resolution
- Admin list and detail views nested under `Subscriptions`
- integration with `Renewals` and `Subscriptions`
- operational hardening through workflow locking, correlation IDs, structured logs, and scheduler summary metrics

## Architectural Overview

The implementation is split into four main layers:

1. domain module
2. workflows and scheduled job
3. admin API
4. admin UI

Each layer has a clear responsibility:

- the domain module owns `dunning_case` and `dunning_attempt`
- workflows own case creation, retry execution, manual resolution, and retry-schedule updates
- the scheduled job discovers due cases and triggers the shared retry workflow
- the admin API exposes read and mutation routes for operators
- the admin UI renders the dunning queue and case detail under the `Subscriptions` area

## 1. Domain Module

The `dunning` custom module is the owner of payment recovery state.

It contains:
- domain types
- the `dunning_case` data model
- the `dunning_attempt` data model
- the module service
- read-model utilities for Admin list, detail, and scheduler reads
- retry-schedule and error helpers
- observability helpers for logging and failure classification

Key design choices:
- one `DunningCase` is anchored to one originating `renewal_cycle_id`
- one subscription may have many historical cases, but only one active case at a time in MVP
- retry history is stored separately as `DunningAttempt`
- `Dunning` owns recovery state, while `RenewalCycle` remains the source of truth for the original renewal execution outcome

## 2. Data Model

The `dunning_case` model stores:
- aggregate identity and ownership fields
- retry lifecycle status
- retry counters and schedule snapshot
- next due retry timestamp
- latest payment error summary
- recovery or closure timestamps
- recovery reason and metadata

Core `dunning_case` fields include:
- `id`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `status`
- `attempt_count`
- `max_attempts`
- `retry_schedule`
- `next_retry_at`
- `last_payment_error_code`
- `last_payment_error_message`
- `last_attempt_at`
- `recovered_at`
- `closed_at`
- `recovery_reason`
- `metadata`

The `dunning_attempt` model stores:
- `id`
- `dunning_case_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`
- `metadata`

### Indexing Strategy

The current migrations and model setup optimize dunning for:
- lookup by `subscription_id`
- lookup by `renewal_cycle_id`
- lookup by `renewal_order_id`
- filtering by `status`
- scheduler discovery by `next_retry_at`
- combined `status + next_retry_at` lookup for due retries
- attempt history lookup by `dunning_case_id`

## 3. Integration Semantics

`Dunning` is integrated with `Renewals` and `Subscriptions` in the current runtime.

The current implementation follows these rules:
- only payment-qualified renewal failures start dunning
- qualifying renewal failures are currently surfaced from payment-session, authorization, and capture failures after the renewal order exists
- `start-dunning` marks the subscription as `past_due` when entering recovery
- `run-dunning-retry` retries payment on the existing renewal order rather than re-running the whole renewal workflow
- successful recovery closes the case as `recovered` and restores the subscription to `active`
- unrecovered closure leaves the originating renewal cycle as `failed` and keeps the subscription in `past_due`

Current retry classification:
- retryable failures include `insufficient_funds`, `generic_decline`, `do_not_honor`, and temporary provider/network errors
- terminal failures include `requires_more`, missing payment method or retry context, expired payment details, and other cases that require manual resolution

This means:
- `Renewals` own the failed billing event
- `Dunning` owns the later payment recovery journey
- `Subscriptions` own the operational customer lifecycle state

The implemented `Cancellation & Retention` area does not take over payment recovery ownership.

Current boundary with `Cancellation & Retention`:
- an active `DunningCase` may coexist with an active `CancellationCase`
- `Cancellation & Retention` may read dunning context for operator visibility
- `Cancellation & Retention` does not become the owner of retry schedule, retry attempts, or dunning closure state
- `past_due` subscriptions may still enter retention or final-cancel flow

This means:
- cancellation workflows may operate while dunning is active
- but dunning lifecycle state remains owned by `Dunning`
- the cancellation module does not directly mutate dunning state as part of normal case progression

## 4. Read Path

The read path is optimized for the Admin dunning queue and case detail.

Main components:
- admin route handlers under `src/api/admin/dunning`
- normalization helpers in `src/api/admin/dunning/utils.ts`
- query helpers in `src/modules/dunning/utils/admin-query.ts`
- scheduler-specific query helper in `src/modules/dunning/utils/scheduler-query.ts`

### Queue Flow

For the queue view:
1. the Admin UI sends query params to `GET /admin/dunning`
2. the route validates and normalizes query input
3. `listAdminDunningCases(...)` applies filters, sorting, pagination, and linked summary enrichment
4. the query layer reads `dunning_case` and the latest attempt status
5. the response is mapped to Admin DTOs used by the DataTable

The current queue supports:
- pagination
- search
- filtering
- sorting
- linked `subscription`, `renewal`, and `order` summaries

### Detail Flow

For the detail view:
1. the Admin UI requests `GET /admin/dunning/:id`
2. the route resolves the case through the detail query helper
3. linked subscription, renewal, and order summaries are resolved
4. full attempt history and retry schedule are mapped into the detail DTO

The detail payload represents:
- the case aggregate
- linked subscription summary
- linked renewal summary
- linked order summary
- retry schedule
- attempt history
- metadata

### Query Boundary Note

In the current runtime, `Dunning` Admin reads use scalar IDs plus query-based enrichment.

The planned module links from the original design are not yet the runtime source for Admin reads.

This means:
- `DunningCase` remains the source query root
- `subscription_id`, `renewal_cycle_id`, and `renewal_order_id` are persisted on the case
- `query.graph()` resolves linked summaries from those scalar references

## 5. Write Path

All state-changing dunning operations are routed through workflows.

Implemented mutations:
- start dunning
- run dunning retry
- mark dunning recovered
- mark dunning unrecovered
- update retry schedule

Write path pattern:
1. `Renewals`, the scheduler, or an Admin route submits workflow input
2. the workflow validates current case and subscription state
3. the workflow applies retry or resolution logic
4. the route returns the refreshed dunning detail payload for Admin mutations

This keeps business logic out of routes and centralizes mutation rules in workflows.

## 6. Workflows

The current mutation layer is built around:
- `start-dunning`
- `run-dunning-retry`
- `mark-dunning-recovered`
- `mark-dunning-unrecovered`
- `update-dunning-retry-schedule`

### Start Workflow

`start-dunning` is the entry mutation for a qualifying failed renewal payment.

It is responsible for:
- validating that the source renewal cycle failed
- validating payment-qualified failure source
- enforcing the single-active-case-per-subscription invariant
- creating or updating the active case for the same cycle
- applying the default retry schedule
- marking the subscription `past_due`

### Retry Workflow

`run-dunning-retry` is the shared payment recovery workflow used by:
- the scheduler job
- manual `retry-now`

It is responsible for:
- validating that the case is retryable
- creating a new `DunningAttempt`
- reusing the renewal order payment context
- creating a new payment session
- authorizing and capturing payment
- transitioning the case to `recovered`, `retry_scheduled`, or `unrecovered`
- restoring the subscription to `active` on recovery

Current implementation detail:
- the workflow acquires a Medusa workflow lock with key `dunning:${dunning_case_id}`
- the current lock settings are `timeout = 5` seconds and `ttl = 120` seconds
- the workflow emits correlation-aware structured operational logs

### Manual Resolution Workflows

The Admin-facing manual workflows are:
- `mark-dunning-recovered`
- `mark-dunning-unrecovered`
- `update-dunning-retry-schedule`

They are responsible for:
- validating allowed transitions
- recording `who / when / reason` in metadata
- updating case lifecycle state
- preserving the same domain rules used by the scheduler path

## 7. Scheduled Processing

`Dunning` is processed by the scheduled job:

- `src/jobs/process-dunning-retries.ts`

The job:
- discovers due cases in batches
- uses a coarse job lock
- executes the shared retry workflow for each case
- logs per-case outcomes
- emits a structured run summary with counters and operational metrics

The scheduler does not implement a separate business flow. It reuses the same core retry logic as manual `retry-now`.

## 8. Concurrency and Operational Hardening

The current implementation hardens both scheduler and manual retry execution.

Protection currently includes:
- coarse scheduler lock through the Locking Module
- per-case workflow lock through `acquireLockStep`
- duplicate-active-case protection on dunning start
- retry guards for terminal cases, in-flight retries, not-due retries, and max-attempt exhaustion
- structured logs with correlation IDs
- scheduler summary metrics including recovery rate, fail rate, average attempts, and average time to recover
- alertable failure classification for unexpected retry and startup failures

## 9. Admin Integration

The `Dunning` UI is implemented as a nested Admin area under `Subscriptions`.

Implemented routes:
- `/app/subscriptions/dunning`
- `/app/subscriptions/dunning/:id`

This keeps `Dunning` visually aligned with the existing `Subscriptions`, `Plans & Offers`, and `Renewals` structure rather than introducing a separate top-level Admin area.

## 10. Summary

`Dunning` is now an implemented operational layer for failed renewal payment recovery.

In the current runtime:
- `Renewals` create the failed debt event
- `Dunning` recovers or closes that debt event
- `Subscriptions` reflect customer lifecycle state such as `active` and `past_due`
- `Cancellation & Retention` may coexist with dunning for the same subscription without taking over recovery ownership

The architecture keeps each domain boundary explicit while still giving operators a single, coherent Admin workspace for recurring commerce operations.
