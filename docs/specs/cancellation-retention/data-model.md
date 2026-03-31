# Reorder: Cancellation & Retention Final Data Model Spec

This document covers step `2.5.10` from `documentation/implementation_plan.md`.

Goal:
- define the final persistence model for `Cancellation & Retention`
- decide whether the area should use one entity, two entities, or a broader event-style model
- define the fields needed for Admin detail, auditability, and workflow decisions
- define whether an optional `churn_reason` dictionary should exist in MVP
- define the indexing strategy for Admin reads and process lookups

This specification builds on:
- `reorder/docs/specs/cancellation-retention/domain-model.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/state-machine.md`
- `reorder/docs/specs/cancellation-retention/lifecycle-semantics.md`
- `reorder/docs/specs/cancellation-retention/module-impact-semantics.md`

The design follows Medusa patterns:
- custom modules own their own data models
- relations inside the same module should use data-model relationships
- relations to other modules should use scalar IDs and later linked enrichment without overlapping ownership
- fields used for filtering, sorting, state transitions, and operational decisions should be stored explicitly
- JSON is appropriate for flexible offer payloads and metadata, not for primary state-machine or reporting fields

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for the persistence model of the future cancellation module

## 1. Design decision summary

The final design should use:
- one primary persistence entity: `CancellationCase`
- one child persistence entity: `RetentionOfferEvent`

This means:
- we do not model cancellation handling only as fields on `Subscription`
- we do not store retention-offer history only in `metadata`
- we do not introduce a generic `cancellation_event` stream in MVP
- we do not introduce a separate `churn_reason` table in MVP

## 2. Why two persistence entities are preferred

Recommended model:
- `CancellationCase`
- `RetentionOfferEvent`

Why this is preferred over a single `CancellationCase` entity only:
- the case aggregate and offer history have different lifecycles
- Admin detail needs an explicit timeline of offers and decisions
- multiple offers must remain auditable as separate records
- workflow rules stay simpler when current case state and offer history are not collapsed into one row

Why this is preferred over a broader event-style design:
- MVP needs operational clarity more than event-sourcing flexibility
- a generic event stream would add read-model complexity without immediate product value
- case + offer-event already covers process state, history, and analytics needs

## 3. Rejected alternatives

### 3.1 Single-entity design

Rejected option:
- only `CancellationCase`, with retention history in `metadata` or JSON arrays

Why it is worse:
- harder to audit
- harder to render case timelines
- weaker history semantics
- less aligned with the established `Renewals` and `Dunning` pattern

### 3.2 Admin-managed reason dictionary in MVP

Rejected option:
- separate `churn_reason` table as part of the initial persistence design

Why it is worse for MVP:
- `reason_category` is already a preset/enum by earlier decision
- `reason` already captures free-text operator context
- a managed dictionary would introduce a separate settings domain without immediate product need
- it would require additional CRUD APIs, Admin UI, and versioning semantics

## 4. Final persistence model

The persistence layer should revolve around:
- one aggregate root: `CancellationCase`
- one child history entity: `RetentionOfferEvent`

### 4.1 `CancellationCase`

`CancellationCase` is the process-state and process-summary record.

### Proposed persisted fields

Plain fields:
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

JSON fields:
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

### 4.2 `RetentionOfferEvent`

`RetentionOfferEvent` is the append-only offer and decision-history record.

### Proposed persisted fields

Plain fields:
- `id`
- `cancellation_case_id`
- `offer_type`
- `decision_status`
- `decision_reason`
- `decided_at`
- `decided_by`
- `applied_at`

JSON fields:
- `offer_payload`
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

## 5. Why no `churn_reason` table in MVP

The MVP should not introduce a `churn_reason` dictionary table.

Why:
- `reason_category` is already the structured reporting and filtering field
- `reason` remains the free-text business explanation
- current product scope does not justify a separate settings/configuration domain

If later needed, a managed reason dictionary can be introduced as a separate feature for:
- localized labels
- activation/deactivation
- separation of selectable reasons from reporting taxonomy

## 6. Scalar vs JSON decisions

Use scalar columns for:
- identifiers
- statuses
- reporting fields
- timestamps
- audit summary fields
- convenience fields used in filtering and sorting

Use JSON for:
- `CancellationCase.metadata`
- `RetentionOfferEvent.offer_payload`
- `RetentionOfferEvent.metadata`

Why:
- the case and event states must stay explicit and queryable
- `offer_payload` is intentionally flexible because its shape varies by `offer_type`
- `metadata` is reserved for non-core extensibility

## 7. Audit and operational fields needed for Admin detail

### `CancellationCase`

The case table must store operational and audit fields directly because they are needed for:
- list filtering
- detail rendering
- action guards
- workflow branching
- churn analytics

Important fields:
- `status`
- `reason_category`
- `recommended_action`
- `final_outcome`
- `finalized_at`
- `finalized_by`
- `cancellation_effective_at`
- `created_at`
- `updated_at`

### `RetentionOfferEvent`

The offer-event table must store event summary and audit fields directly because they are needed for:
- timeline rendering
- offer acceptance metrics
- action history
- troubleshooting applied vs not-applied offers

Important fields:
- `offer_type`
- `decision_status`
- `decision_reason`
- `decided_at`
- `decided_by`
- `applied_at`
- `created_at`
- `updated_at`

## 8. Relation strategy inside the module

The relation between `CancellationCase` and `RetentionOfferEvent` should be an internal same-module relationship.

Recommended semantics:
- one `CancellationCase` has many `RetentionOfferEvent` records
- one `RetentionOfferEvent` belongs to one `CancellationCase`

Why:
- this is a same-module data-model relationship
- module links are for cross-module isolation boundaries, not internal entity relationships

## 9. Relation strategy across modules

The cancellation module should keep scalar IDs for external context and avoid duplicating ownership.

### `subscription_id`

`CancellationCase` should store:
- `subscription_id` as a scalar field

Why:
- it supports filtering, indexing, and active-case lookup
- it matches the practical pattern already used in `Renewals` and `Dunning`
- linked enrichment can be added later without removing efficient source-record access

### No direct persistence relation to `DunningCase` or `RenewalCycle` in MVP

At this stage, the persistence model should not add direct fields such as:
- `dunning_case_id`
- `renewal_cycle_id`

Why:
- `Cancellation & Retention` does not own those aggregates
- the current Admin and workflow contract can rely on `subscription_id` plus linked reads or query-time enrichment later
- adding those fields now would suggest stronger ownership coupling than the current design allows

## 10. Indexing strategy for `cancellation_case`

Recommended indexes:
- index on `subscription_id`
- index on `status`
- index on `final_outcome`
- index on `reason_category`
- index on `created_at`

Recommended additional compound indexes:
- compound index on `subscription_id, status`
- compound index on `status, created_at`

Why:
- `subscription_id` supports active-case lookup and detail joins
- `status`, `final_outcome`, and `reason_category` support Admin filters and reporting
- `created_at` supports default timeline and list sorting
- compound indexes improve common active-case and queue-like reads

## 11. Indexing strategy for `retention_offer_event`

Recommended indexes:
- index on `cancellation_case_id`
- index on `offer_type`
- index on `decision_status`
- index on `created_at`

Recommended additional compound indexes:
- compound index on `cancellation_case_id, created_at`
- compound index on `offer_type, decision_status`

Why:
- `cancellation_case_id` supports timeline reads for one case
- `offer_type` and `decision_status` support future analytics and Admin filters
- `created_at` supports chronological ordering
- compound indexes improve timeline rendering and acceptance-rate style aggregations

## 12. Active-case uniqueness invariant

The business invariant remains:
- one subscription may have at most one active `CancellationCase` at a time

Recommended interpretation at this stage:
- the invariant should be enforced primarily in workflow/service logic
- a database-level optimization or stronger uniqueness strategy may be added later once the runtime implementation and database behavior are finalized

Why this is preferred:
- active vs terminal status semantics are business-level rules
- workflow enforcement is required regardless of database constraints
- it keeps the persistence design portable while preserving the invariant

## 13. Summary decision

The MVP persistence model is:
- `cancellation_case`
- `retention_offer_event`

With these key principles:
- no `churn_reason` table in MVP
- explicit scalar fields for core process and reporting state
- JSON only for flexible payloads and metadata
- same-module relation between case and offer events
- scalar `subscription_id` for cross-domain context
- indexes optimized for Admin list, detail, and case lookup
