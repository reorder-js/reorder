# Activity Log Architecture

This document describes the implemented architectural boundary for the `Activity Log` area in the `Reorder` plugin.

It is the runtime source of truth for:
- ownership and source-of-truth rules
- event contract and taxonomy
- write path and read path boundaries
- retention and operational considerations

## Goal

The `Activity Log` area provides a unified operator-facing audit trail for subscription-related business events across the plugin.

Its purpose is to:
- show important lifecycle events for one subscription in one place
- give operators a readable audit trail across multiple recurring-commerce areas
- support future Admin list, detail, and timeline views

Its purpose is not to replace the source domain models that already own their own business state.

## Architectural Role

`Activity Log` is a dedicated append-only business audit layer.

It should aggregate important subscription-related events emitted by:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

The key architectural decision is:

- `Activity Log` is the canonical append-only audit trail for operator-facing business events around a subscription.
- `Activity Log` is not the source of truth for domain state owned by the existing modules.

This means the log is a cross-domain audit view, not a replacement for existing aggregates.

## Ownership Boundaries

The current ownership model of the plugin remains unchanged.

`Subscriptions` remain the source of truth for:
- subscription lifecycle state
- cadence and renewal scheduling fields
- shipping address and pending plan change materialization

`Plans & Offers` remain the source of truth for:
- subscription offer configuration
- allowed billing frequencies
- offer rules and effective policy resolution

`Renewals` remain the source of truth for:
- renewal cycle execution state
- renewal attempt history
- approval decisions and execution outcomes

`Dunning` remains the source of truth for:
- payment recovery state
- retry schedule
- dunning attempt history
- recovered and unrecovered outcomes

`Cancellation & Retention` remains the source of truth for:
- cancellation process state
- retention offer history
- churn reason and final cancellation outcome

`Activity Log` does not take ownership away from any of the above modules.

## Relation to Existing Audit Fields and Metadata

The plugin already stores audit-oriented data inside domain-specific modules.

Examples include:
- explicit actor fields such as `finalized_by`, `decided_by`, and approval-related fields
- append-only `manual_actions` metadata in `Cancellation & Retention`
- renewal and dunning attempt history
- workflow-specific metadata and manual-operation context

These fields remain valid and should stay in their owning modules.

The architectural role of `Activity Log` is different:
- domain modules keep detailed, module-local audit context
- `Activity Log` provides a unified cross-domain audit trail for operators

This means:
- `Activity Log` may summarize or reference important outcomes from those modules
- it should not replace detailed attempt history or module-specific metadata
- it should not become a dumping ground for every internal field or diagnostic value

## Business Audit Trail vs Operational Logging

The plugin already uses structured operational logging and scheduler summary metrics in areas such as `Renewals`, `Dunning`, and `Cancellation & Retention`.

Those operational logs remain a separate concern.

`Activity Log` should contain only business-significant, operator-facing events, such as:
- subscription paused, resumed, canceled
- plan change scheduled or applied
- shipping address updated
- renewal attempted, succeeded, failed
- dunning started, retried, recovered, unrecovered
- cancellation case started
- retention offer applied
- cancellation finalized

`Activity Log` should not contain low-level operational or diagnostic noise, such as:
- scheduler heartbeat and batch summaries
- lock-acquisition diagnostics
- retry internals and step-level debug output
- infrastructure or transport-layer errors
- sensitive payment details

Those concerns belong in structured logs, observability helpers, and operational metrics, not in the business audit trail.

## Medusa Boundary Rules

The decision follows Medusa's modular architecture rules:
- domain modules stay isolated
- cross-module business coordination happens in workflows
- read models can aggregate data for Admin without transferring ownership between modules

For `Activity Log`, this means:
- log entries should be created from workflow-backed mutation paths
- module services should keep owning their own state
- the future Admin read layer may aggregate events across domains, but it must not redefine domain ownership

## Event Record Contract

`Activity Log` stores one append-only record per business-significant subscription event.

The logical event contract is:
- `id`
- `subscription_id`
- `customer_id`
- `event_type`
- `actor_type`
- `actor_id`
- `previous_state`
- `new_state`
- `changed_fields`
- `reason`
- `metadata`
- `created_at`

### Field Semantics

`id`
- unique event identifier

`subscription_id`
- required
- the log is centered on one subscription lifecycle

`customer_id`
- optional but persisted when known
- used for Admin filtering and customer-level audit lookups

`event_type`
- required
- one stable domain event name from the taxonomy defined below

`actor_type`
- required
- indicates who or what triggered the event
- current planned values:
  - `user`
  - `system`
  - `scheduler`

`actor_id`
- optional
- stores the admin user ID or other actor identifier when available

`previous_state`
- optional JSON summary
- stores only the event-relevant state before the mutation
- must not contain full raw copies of owning aggregates

`new_state`
- optional JSON summary
- stores only the event-relevant state after the mutation
- must not contain full raw copies of owning aggregates

`changed_fields`
- optional structured diff
- should capture a compact before/after representation of the fields that changed
- intended shape:
  - array of field-level entries such as `field`, `before`, `after`

`reason`
- optional business-facing or operator-facing reason
- for example approval reason, retention decision reason, or manual cancellation reason

`metadata`
- optional JSON
- used for stable references and limited technical context, such as:
  - `renewal_cycle_id`
  - `dunning_case_id`
  - `cancellation_case_id`
  - `retention_offer_event_id`
  - `order_id`
  - `correlation_id`
- should not contain sensitive payment details or unbounded diagnostic payloads

`created_at`
- required event timestamp

## State Payload Rules

The event record is intended to stay stable and operator-readable over time.

Because of that, `previous_state`, `new_state`, and `changed_fields` should follow these rules:
- store small event-specific summaries, not full entity snapshots
- include only the fields needed to explain what changed
- avoid copying large nested domain objects
- avoid leaking sensitive payment or infrastructure data

Examples of good event-level state summaries:
- status before and after a pause or resume
- pending plan change before and after approval decision
- retry schedule before and after manual override

Examples of data that should stay outside the event state payload:
- full attempt history arrays
- full subscription snapshots
- full order payloads
- raw provider diagnostics

## Event Type Taxonomy

The `Activity Log` should use a stable, explicit taxonomy grouped by domain prefix.

### Subscription Events

- `subscription.paused`
- `subscription.resumed`
- `subscription.canceled`
- `subscription.plan_change_scheduled`
- `subscription.shipping_address_updated`

### Renewal Events

- `renewal.cycle_created`
- `renewal.approval_approved`
- `renewal.approval_rejected`
- `renewal.force_requested`
- `renewal.succeeded`
- `renewal.failed`

### Dunning Events

- `dunning.started`
- `dunning.retry_executed`
- `dunning.recovered`
- `dunning.unrecovered`
- `dunning.retry_schedule_updated`

### Cancellation & Retention Events

- `cancellation.case_started`
- `cancellation.offer_applied`
- `cancellation.reason_updated`
- `cancellation.finalized`

## Physical Model

The implemented storage model is `subscription_log`.

It is owned by the dedicated `activity-log` module and remains append-only from the business point of view.

The record persists:
- core identity and filter fields
- compact state summaries
- structured `changed_fields`
- limited metadata references
- display snapshots for Admin read paths
- `dedupe_key` for idempotent workflow-backed writes

The model intentionally does not store:
- full aggregate snapshots
- full payment payloads
- technical observability noise
- deep linked read-model hydration

## Write Path

Business events are written from workflow-backed mutation paths.

The implemented write path is:
1. domain workflow mutates source-of-truth state
2. workflow builds a normalized business audit payload
3. `create-subscription-log-event` persists one append-only `subscription_log` record

Normalization rules are centralized in the shared activity-log helper and cover:
- compact `previous_state` and `new_state`
- `changed_fields`
- sensitive-data redaction
- `metadata` allow-listing
- deterministic `dedupe_key`

Idempotency is enforced through:
- deterministic `dedupe_key`
- unique index protection
- create-with-conflict-handling semantics in the central write step

## Read Path

The implemented read model is snapshot-first and optimized for Admin.

Read paths currently supported:
- global Admin list
- detail for one event
- timeline per subscription

The global list and timeline read primarily from `subscription_log` itself.

The detail view returns the full event payload from the same record:
- `previous_state`
- `new_state`
- `changed_fields`
- `metadata`

The read model intentionally avoids heavy cross-module runtime enrichment for the base experience.

This keeps the audit trail:
- historically stable
- fast to read
- resilient to later changes in linked domain entities

## Admin Boundary

The Admin experience is intentionally split into two surfaces:
- a dedicated `Activity Log` page for cross-subscription operations
- an `Activity Log` section in the subscription detail page for per-subscription review

Both surfaces use the same snapshot-first API contracts and the same underlying `subscription_log` records.

The Admin UI does not define new business semantics.

Its role is to expose:
- filtering
- sorting
- pagination
- detail drill-down
- subscription timeline review

## Retention Policy

`Activity Log` is treated as a business audit trail, not as short-lived telemetry.

The current retention policy for v1 is:
- no automatic purge
- no time-based cleanup job
- no silent archival policy in the background

Reasoning:
- audit usefulness depends on historical continuity
- the payload is intentionally compact
- operational cleanup rules should be explicit and separately implemented if introduced later

If a future retention requirement appears, it should be implemented as a dedicated maintenance capability with:
- an explicit retention window
- clear archival or purge semantics
- separate documentation and rollout guidance

## Monitoring and Performance

Operationally, the following should be observed for `Activity Log`:
- row growth in `subscription_log`
- event volume per day and per week
- response time for:
  - `GET /admin/subscription-logs`
  - `GET /admin/subscription-logs/:id`
  - `GET /admin/subscriptions/:id/logs`
- query behavior around:
  - `subscription_id`
  - `customer_id`
  - `event_type`
  - `created_at`

Current operational assumptions:
- the main list and timeline are paginated
- the default sort is `created_at desc`
- the current indexes are sufficient for the expected v1 workload

Signals that should trigger review:
- visible slowdown on global list queries
- visible slowdown on subscription timeline queries
- large increases in `subscription_log` volume caused by noisy event emission
- pressure to broaden search or enrichment beyond the current snapshot-first model

## Non-Goals

The current `Activity Log` implementation does not aim to provide:
- general-purpose telemetry
- provider-level payment diagnostics
- full historical snapshots of domain aggregates
- automatic retention cleanup
- export tooling
- saved filters or user-level personalization

Those areas are future enhancements, not part of the v1 architectural contract.

## Scope Decision for Plans & Offers

`Plans & Offers` are part of the recurring-commerce runtime, but they should not introduce standalone global configuration events into the subscription-centric `Activity Log` in v1.

Reasoning:
- `Activity Log` is centered around one subscription
- `Plans & Offers` primarily manage product-level or variant-level configuration
- create, update, and toggle operations on offer configuration are not inherently events of one specific subscription

So the current scope decision is:
- do not add standalone `plan-offer.*` events to `Activity Log` v1
- capture the subscription-facing effect of plan configuration through subscription and renewal events instead

Examples:
- a future plan change requested on a subscription is represented by `subscription.plan_change_scheduled`
- renewal success or failure after policy validation is represented by renewal events

If configuration-audit requirements become important later, they should be modeled as a separate configuration audit trail rather than folded into the per-subscription activity stream.

## SubscriptionLog Data Model

The future `Activity Log` area should use a dedicated custom data model named `subscription_log`.

This model is intended to be:
- append-only
- subscription-centric
- optimized for Admin list, detail, and per-subscription timeline reads

It is not intended to become a generalized event bus or a storage area for operational diagnostics.

The runtime owner of that model is the dedicated Medusa custom module:
- `src/modules/activity-log`

The module exposes:
- `ACTIVITY_LOG_MODULE = "activityLog"`
- the `subscription_log` data model
- the module service used later by workflows and Admin read helpers

## Append-Only Semantics

`subscription_log` should be treated as an append-only entity.

That means:
- one business event produces one log record
- existing records are not edited as part of normal business flow
- state evolution is represented by new log entries, not by mutating older ones

This keeps the audit trail stable and understandable for operators.

The append-only rule is especially important because the log is meant to describe historical business events, not current domain ownership.

## Proposed Physical Fields

The model should store the following fields:

- `id`
- `subscription_id`
- `customer_id`
- `event_type`
- `actor_type`
- `actor_id`
- `subscription_reference`
- `customer_name`
- `product_title`
- `variant_title`
- `previous_state`
- `new_state`
- `changed_fields`
- `reason`
- `metadata`

Automatic Medusa fields are also present:
- `created_at`
- `updated_at`
- `deleted_at`

### Core Filtering Fields

The primary Admin filtering and timeline fields are:
- `subscription_id`
- `customer_id`
- `event_type`
- `created_at`

These should be first-class scalar columns, not values hidden inside JSON.

### JSON Fields

The model should use JSON fields for:
- `previous_state`
- `new_state`
- `changed_fields`
- `metadata`

These JSON fields are justified because they store event-specific payloads that may vary by event type.

However, they should remain compact and bounded:
- no full aggregate copies
- no attempt-history arrays
- no raw payment-provider payloads
- no large diagnostic dumps

## Display Snapshot Decision

The `subscription_log` model should store a small set of display-oriented snapshot fields directly on the record:
- `subscription_reference`
- `customer_name`
- `product_title`
- `variant_title`

This is the recommended decision for `Activity Log` v1.

### Why store small display snapshots

The audit trail should remain readable even if current linked entities change later.

For example:
- a customer's display name may change
- a product or variant title may change
- subscription-facing labels may evolve after the event happened

If the Admin log relied only on current enrichment, historical events could become misleading.

Small snapshots solve that problem without copying the whole subscription aggregate.

### Why not store full entity snapshots

The current plugin already uses snapshots where they are operationally necessary, especially in `Subscriptions`.

For `Activity Log`, a full snapshot would be unnecessary and too heavy because:
- the log is event-focused, not aggregate-focused
- most Admin list rows only need a few stable display labels
- large snapshots would create schema drift and duplication pressure

So the agreed rule is:
- store a few stable display snapshot fields as scalar columns
- keep event-specific change detail in compact JSON fields
- rely on query-time enrichment only for optional contextual detail, not for the core audit labels

## Indexing Strategy

The initial indexing strategy should match the plugin's existing pattern of pragmatic scalar indexes.

Required single-column indexes:
- `subscription_id`
- `customer_id`
- `event_type`
- `created_at`

Required compound indexes:
- `subscription_id + created_at`
- `customer_id + created_at`
- `event_type + created_at`

## Workflow Emission Scope

`Activity Log` entries are emitted from workflow-backed mutation paths, not directly from routes or low-level technical helpers.

For `Cancellation & Retention`, the current business-event emission scope is:
- `start-cancellation-case` -> `cancellation.case_started`
- `apply-retention-offer` -> `cancellation.offer_applied`
- `update-cancellation-reason` -> `cancellation.reason_updated`
- `finalize-cancellation` -> `cancellation.finalized`

These entries are intended to summarize operator-facing outcomes of the cancellation flow.

They do not replace the more detailed module-local audit context stored in the cancellation domain itself, such as:
- `finalized_by`
- `decided_by`
- `manual_actions`
- offer-event history
- detailed case metadata

Those detailed process records remain source-of-truth inside `Cancellation & Retention`.

`Activity Log` only stores a compact cross-domain summary that is suitable for Admin timeline and audit views.

## Admin Read Model

`Activity Log` should expose a dedicated Admin read model, separate from the module service write paths.

The recommended shape follows the same pattern already used in the plugin's other Admin areas:
- dedicated read/query helpers
- dedicated Admin DTOs
- read composition outside the module's core write service

The read model should support three query paths:
- global log list
- single log detail
- per-subscription timeline

## Global Log List

The global list is intended for the future `Activity Log` Admin page.

Its purpose is to support:
- high-signal operator audit browsing
- filtering across subscriptions and customers
- pagination and default descending chronology

The recommended list DTO includes:
- `id`
- `subscription_id`
- `subscription_reference`
- `customer_id`
- `customer_name`
- `event_type`
- `actor_type`
- `actor_id`
- `reason`
- `created_at`
- compact `change_summary`

### List Filters

The list read path should support:
- `subscription_id`
- `customer_id`
- `event_type[]`
- `actor_type[]`
- `date_from`
- `date_to`
- free-text `q`

Free-text search should be limited to stable operator-facing fields:
- `subscription_reference`
- `customer_name`
- `reason`

### List Sorting and Pagination

The default sort should be:
- `created_at desc`

Pagination should follow the plugin's standard Admin pattern:
- `limit`
- `offset`
- `count`

The global list should read directly from `subscription_log` and should not require linked runtime enrichment to render useful rows.

## Log Detail

The log detail read path is intended for drill-down from the Admin table or timeline.

The detail DTO should expose the full event payload:
- `id`
- `subscription_id`
- `customer_id`
- `event_type`
- `actor_type`
- `actor_id`
- display snapshot fields
- `previous_state`
- `new_state`
- `changed_fields`
- `reason`
- `metadata`
- `created_at`

The detail view may optionally add a light linked summary for the related subscription, but that enrichment should stay intentionally small.

Recommended optional linked summary:
- `subscription_id`
- `subscription_reference`
- current subscription `status`

The detail read path should not eagerly hydrate current `renewal`, `dunning`, or `cancellation` state, because that would mix historical audit data with current cross-module runtime state.

## Per-Subscription Timeline

The per-subscription timeline is intended for embedding inside the `Subscriptions` Admin experience.

It should use the same underlying event records as the global list, but filtered by one `subscription_id`.

The timeline DTO can reuse the list DTO with the same core fields:
- `id`
- `event_type`
- `actor_type`
- `actor_id`
- `reason`
- `created_at`
- `change_summary`
- display snapshot fields when needed

The timeline should support:
- default `created_at desc`
- optional ascending order later if needed for timeline playback

Timeline grouping, badges, and presentation logic belong to the UI layer, not to the read model.

## Enrichment Decision

The final read-model decision for `Activity Log` v1 is:
- use `snapshot-first` display data
- allow optional light enrichment only where clearly needed

This means:
- the primary list and timeline should render from `subscription_log` alone
- display labels come from stored snapshot fields
- optional linked lookup can be added for detail convenience, but it is not the foundation of the read model

### Why snapshot-first

The audit trail must remain historically stable.

If current linked entities changed over time:
- customer names could change
- product titles could change
- variant titles could change
- subscription-facing labels could drift

Using snapshot fields as the first source preserves what operators should have seen at the time of the event.

### Why not full linked enrichment

Heavy linked enrichment would create several problems:
- it would weaken the historical nature of the audit trail
- it would introduce unnecessary cross-module coupling into Admin reads
- it would make the list and timeline more expensive than needed

So the agreed rule is:
- list and timeline are snapshot-first and table-local
- detail may use light enrichment for convenience
- current domain state stays owned by its original modules

Reasoning:
- `subscription_id + created_at` supports the per-subscription timeline
- `customer_id + created_at` supports future customer-level audit queries
- `event_type + created_at` supports operational filtering in Admin
- `created_at` supports default reverse-chronological browsing

The initial model should not add JSON indexes.

Reasoning:
- the expected primary query paths are scalar and time-based
- JSON indexing would add complexity before real query evidence exists
- event payload filtering is not a primary v1 requirement

## Module and Migration Strategy

`subscription_log` should live in a dedicated `activity-log` custom module.

The runtime pattern should match the current plugin conventions:
- dedicated data model
- dedicated module service
- dedicated migrations
- scalar references to external domains instead of direct cross-module ownership

Current implementation status:
- the module skeleton exists in `src/modules/activity-log`
- the model, service, and module export are defined
- the initial migration and module snapshot now exist under `src/modules/activity-log/migrations`

The first migration for the module should:
- create the `subscription_log` table
- create the scalar and compound indexes listed above
- rely on Medusa's standard `deleted_at` partial-index pattern

Current implementation status:
- the generated migration creates the `subscription_log` table
- the generated migration includes the required scalar indexes
- the generated migration includes the compound timeline and Admin filter indexes
- the generated migration includes a unique index for `dedupe_key`
- applying the migration to the database remains a separate application-level step

## Normalization Helper Boundary

Before event records are written, they should pass through a shared normalization helper owned by the `activity-log` module.

The helper is responsible for:
- building compact `changed_fields` from `previous_state` and `new_state`
- redacting sensitive values from event state payloads
- filtering `metadata` down to a stable allow-list
- attaching `correlation_id` when one already exists in the calling flow
- generating a deterministic `dedupe_key`

The helper is intentionally:
- synchronous
- side-effect free
- independent from the Medusa container

This keeps payload shaping reusable across workflows without mixing normalization logic into persistence logic.

### Redaction Rules

The helper should remove or exclude sensitive values from state payloads and metadata.

Current protected categories include:
- full shipping address lines
- phone numbers
- payment context and payment references
- raw provider payloads
- stack traces and low-level diagnostics

The goal is to preserve operator-facing business meaning without turning `Activity Log` into a storage area for sensitive or low-level technical data.

### Dedupe Key Rules

The helper should generate `dedupe_key` deterministically from:
- `event_type`
- a domain scope
- a target domain identifier
- an optional event qualifier

This allows later workflow-backed writes to remain idempotent across retries.

## Central Workflow Write Step

The future write path should use one central workflow step for persistence:
- `create-subscription-log-event`

The step is responsible only for:
- receiving a workflow-friendly normalized event payload
- checking for an existing record by `dedupe_key`
- creating a new `subscription_log` record only when needed
- returning compensation input that distinguishes `created` from `existing`

### Idempotency Rule

The step should treat `dedupe_key` as the primary logical idempotency key.

Current write strategy:
- read by `dedupe_key`
- if a record exists, reuse it
- if no record exists, create one

The unique database index on `dedupe_key` remains the last line of protection against duplicate writes.

### Compensation Rule

The step's compensation function should delete only records created by the current workflow execution.

It should not delete:
- previously existing log records
- records returned because the write path hit an idempotent duplicate

The model should not introduce hard foreign keys to other modules.

This follows the same practical boundary already used in:
- `renewal_cycle`
- `dunning_case`
- `cancellation_case`

Those areas persist scalar identifiers and use query-time enrichment rather than cross-module ownership at the SQL level.

## Current Renewal Emission Scope

The current `Renewals` integration emits `Activity Log` events only for final business-significant outcomes and operator decisions.

Implemented renewal events:
- `renewal.approval_approved`
- `renewal.approval_rejected`
- `renewal.force_requested`
- `renewal.succeeded`
- `renewal.failed`

Emission boundaries:
- approval decisions are emitted from the approval workflows
- manual force-run is emitted only after the force request passes domain validation
- renewal execution emits only the final `succeeded` or `failed` outcome

The following remain outside `Activity Log` and stay in renewal observability only:
- workflow lock acquisition and release
- attempt creation and attempt-processing internals
- payment-session and payment-provider internals
- structured scheduler and force-run diagnostics
- blocked execution cases such as `already_processing` and `duplicate_execution`

This keeps the renewal activity stream operator-readable while preserving detailed operational tracing in `src/modules/renewal/utils/observability.ts`.

## Summary

The agreed boundary for `Activity Log` is:

- it is a canonical append-only business audit trail for subscription-related events
- it is not the source of truth for subscription, renewal, dunning, or cancellation state
- existing module-local audit fields and histories remain in place
- structured operational logs remain separate from the business audit trail
- cross-domain event recording should happen through workflow orchestration, consistent with Medusa patterns
- event records should stay compact, stable, and operator-readable
- `Plans & Offers` configuration changes are out of scope for standalone `Activity Log` v1 events
- `subscription_log` should be a dedicated append-only model with scalar filter fields and compact JSON payloads
- `subscription_log` should store small Admin display snapshots directly on the record
