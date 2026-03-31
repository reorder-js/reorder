# Reorder: Dunning Final Data Model Spec

This document covers step `2.4.5` from `documentation/implementation_plan.md`.

Goal:
- define the final persistence model for `Dunning`
- decide whether the area should use one entity, two entities, or an event-style hybrid
- define relations to subscriptions, renewal cycles, and renewal orders
- define the fields needed for Admin detail, auditability, and retry scheduling
- define the indexing strategy for scheduler and Admin reads

This specification builds on:
- `reorder/docs/specs/dunning/domain-model.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/module-links.md`

The design follows Medusa patterns:
- custom modules own their own data models
- relations inside the same module should use data-model relationships
- relations to other modules may use scalar IDs plus query-based enrichment in the current runtime, with module links remaining a planned refinement
- fields used for queue processing, filtering, sorting, and operational decisions should be stored explicitly
- JSON is appropriate for policy snapshots and flexible metadata, not for primary state-machine fields

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for the persistence model
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. Design decision summary

The final design should use:
- one primary persistence entity: `DunningCase`
- one child persistence entity: `DunningAttempt`

This means:
- we do not model dunning only as fields on `Subscription`
- we do not model dunning only as fields on `RenewalCycle`
- we do not store retry history only in `metadata`
- we do not introduce a generic `dunning_event` stream in MVP

## 2. Why two persistence entities are preferred

Recommended model:
- `DunningCase`
- `DunningAttempt`

Why this is preferred over a single `DunningCase` entity only:
- retry history has its own lifecycle and audit value
- multiple recovery attempts must be traceable as separate records
- Admin detail needs an explicit attempt timeline
- keeping all history only on the case would make scheduler and read-model logic harder to reason about

Why this is preferred over a larger event-style design:
- MVP needs operational clarity more than event-sourcing flexibility
- a separate event stream would add complexity without immediate product value
- case + attempt already covers queue state, recovery history, and troubleshooting

## 3. Rejected alternatives

### 3.1 Single-entity design

Rejected option:
- only `DunningCase`, with retry history in `metadata` or JSON arrays

Why it is worse:
- harder to audit
- harder to display retry timelines
- weaker retry semantics
- more fragile for filtering and later analytics

### 3.2 Event-only design

Rejected option:
- `DunningCase`
- generic `DunningEvent`
- optional `DunningAttempt` derived from events

Why it is worse for MVP:
- too much indirection for the current Admin use case
- retry and closure semantics become harder to read
- greater implementation and read-model complexity

## 4. Final persistence model

The persistence layer should revolve around:
- one aggregate root: `DunningCase`
- one child history entity: `DunningAttempt`

### 4.1 `DunningCase`

`DunningCase` is the queue and recovery-state record.

### Proposed persisted fields

Plain fields:
- `id`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `status`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `last_payment_error_code`
- `last_payment_error_message`
- `last_attempt_at`
- `recovered_at`
- `closed_at`
- `recovery_reason`

JSON fields:
- `retry_schedule`
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

### 4.2 `DunningAttempt`

`DunningAttempt` is the recovery-history record.

### Proposed persisted fields

Plain fields:
- `id`
- `dunning_case_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`

JSON fields:
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

## 5. Why `max_attempts` is explicit

The model should store `max_attempts` directly on `DunningCase`.

Why:
- retry eligibility depends on it
- Admin should display the current limit without reconstructing it from policy defaults
- a case should preserve the retry limit snapshot active when it was created

This avoids coupling current case behavior to future changes in default retry policy.

## 6. Why `next_retry_at` is explicit

The model should store `next_retry_at` directly on `DunningCase`.

Why:
- scheduler discovery needs direct filtering by due timestamp
- Admin list and detail need direct visibility of the next planned retry
- sorting and filtering by due retry time must not depend on reading JSON

This field is the operational scheduling pointer for the case.

## 7. Why latest error summary belongs on `DunningCase`

The model should store:
- `last_payment_error_code`
- `last_payment_error_message`

Why this is preferred:
- Admin list needs a compact failure summary
- scheduler and operational flows may need latest error context without loading attempts
- the case aggregate should expose current recovery state directly

Important note:
- these fields are not the full error history
- detailed recovery-attempt error context belongs to `DunningAttempt`

## 8. Why `retry_schedule` belongs on `DunningCase` as JSON

The model should store `retry_schedule` on `DunningCase` as JSON.

Why:
- it is a policy snapshot, not a single control scalar
- the exact shape may evolve with later retry-policy decisions
- the case should preserve the schedule assigned to it even if global defaults later change

This field should not replace:
- `next_retry_at`
- `attempt_count`
- `max_attempts`

Those remain explicit scalar operational fields.

## 9. Relation strategy inside the module

The relation between `DunningCase` and `DunningAttempt` should be an internal same-module relationship.

Recommended semantics:
- one `DunningCase` has many `DunningAttempt` records
- one `DunningAttempt` belongs to one `DunningCase`

Why:
- this is a same-module data-model relationship
- Medusa module links are for cross-module isolation boundaries, not internal entity relationships

## 10. Relation strategy across modules

The `dunning` module should keep scalar IDs and also define module links to external modules where needed.

### `subscription_id`

`DunningCase` should store:
- `subscription_id` as a scalar field

And the module should later define:
- a module link between `dunning_case` and `subscription`

Why both are needed:
- scalar ID supports filtering, indexing, uniqueness checks, and scheduler logic
- module link supports cross-module reads without breaking isolation

### `renewal_cycle_id`

`DunningCase` should store:
- `renewal_cycle_id` as a scalar field

And the module should later define:
- a module link between `dunning_case` and `renewal_cycle`

Why:
- the case is anchored to one originating debt event
- Admin list and detail will need renewal context
- the dunning aggregate remains self-contained while still allowing linked enrichment

### `renewal_order_id`

`DunningCase` should store:
- `renewal_order_id` as a scalar field

And the module should later define:
- a module link between `dunning_case` and `order`

Why:
- some dunning cases need order context for Admin detail and future retry orchestration
- linked reads should still follow module isolation rules

### Payment artifacts

At this stage:
- `payment_collection`
- `payment_session`
- `payment`

should not be modeled as direct linked relations in the MVP persistence model.

Reason:
- the current contract can be satisfied with case-level error summary and attempt-level `payment_reference`
- payment-link needs are still deferred to later retry/detail decisions

## 11. Snapshot and audit fields needed for Admin detail

For the current MVP, the data model should support Admin detail with:
- case status and scheduling fields on `DunningCase`
- latest error summary on `DunningCase`
- closure and recovery summary on `DunningCase`
- retry policy snapshot on `DunningCase`
- retry timeline data on `DunningAttempt`

The model does not need to store full copies of:
- subscription snapshots again on the case
- renewal-cycle snapshots again on the case
- order snapshots again on the case

Why:
- those belong to their owning domains
- duplication should be avoided unless detached historical reconstruction becomes necessary later
- current Admin detail can combine linked external context with dunning-specific state

## 12. Convenience fields

The final model should keep convenience fields on `DunningCase`:
- `attempt_count`
- `next_retry_at`
- `last_payment_error_code`
- `last_payment_error_message`
- `last_attempt_at`

Why:
- scheduler processing should work from the case aggregate efficiently
- Admin list rendering should not aggregate child records on every read
- the case remains the operational root for recovery state

## 13. Status ownership

### `DunningCase.status`

Owned by the case aggregate.

It answers:
- where the case is in its recovery lifecycle

### `DunningAttempt.status`

Owned by the attempt record.

It answers:
- the result of one concrete recovery attempt

These statuses must remain separate.

The case status should not be inferred every time from attempt history alone.

## 14. Indexing implications

The final data model implies later indexes at least for:

`DunningCase`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `status`
- `next_retry_at`
- `last_attempt_at`
- `recovered_at`
- `closed_at`
- composite index on `status` + `next_retry_at`

`DunningAttempt`
- `dunning_case_id`
- `attempt_no`
- `status`
- `started_at`
- `finished_at`
- composite unique index on `dunning_case_id` + `attempt_no`

These indexes should support:
- retry-queue selection
- Admin filtering
- detail loading
- attempt timeline ordering

### Why `status + next_retry_at` matters

This composite index is important because the scheduler will most likely discover retryable cases by:
- active or retry-eligible status
- `next_retry_at <= now`

Without this composite index, the retry queue can become less efficient as volume grows.

## 15. Recommended model-level fields for later uniqueness rules

The persistence model should support later enforcement of:
- one case per `renewal_cycle_id`
- one active case per `subscription_id` in MVP semantics

At this step, the data-model decision is:
- keep the scalar IDs and statuses needed to enforce those rules later
- leave the exact database-constraint strategy to implementation and migration design

Why:
- some uniqueness rules may depend on active-vs-closed status semantics
- this may require either partial unique indexes or workflow-level guards depending on implementation constraints

## 16. Final recommendation

The recommended MVP persistence model is:

- `DunningCase`
  - aggregate root
  - current recovery state
  - retry scheduling fields
  - latest payment error summary
  - closure and recovery summary
  - queue-friendly convenience fields

- `DunningAttempt`
  - append-only child history
  - recovery timestamps
  - technical failure context
  - payment reference

No separate event entity is needed in MVP.

If the domain later requires:
- richer operator timelines
- multiple manual decisions
- payment-artifact-specific history
- audit events beyond recovery attempts

then a `DunningEvent`-style model can be introduced later without invalidating the core case + attempt structure.

## 17. Impact on later steps

This final model means:
- the `dunning` module implementation should export two data models
- same-module relationships should be used between case and attempt
- module links should later connect the case to `subscription`, `renewalCycle`, and `order`
- workflows should update the case aggregate and append attempts explicitly
- the Admin read model should use `DunningCase` as the root for list/detail and attach attempts for detail reads
