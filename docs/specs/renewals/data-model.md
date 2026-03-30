# Reorder: Renewals Final Data Model Spec

This document covers step `2.3.4` from `documentation/implementation_plan.md`.

Goal:
- define the final persistence model for `Renewals`
- decide whether the area should use one entity, two entities, or an event-style hybrid
- define relations to subscriptions and generated orders
- define the fields needed for Admin detail, auditability, and queue processing
- decide where approval metadata belongs

This specification builds on:
- `reorder/docs/specs/renewals/admin-spec.md`
- `reorder/docs/specs/renewals/domain-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`

The design follows Medusa patterns:
- custom modules own their own data models
- relations inside the same module should use model relationships
- relations to other modules should use module links
- fields used for queue processing, filtering, sorting, and operational decisions should be stored explicitly
- JSON is appropriate for snapshots and flexible metadata, not for primary state-machine fields

## 1. Design decision summary

The final design should use:
- one primary persistence entity: `RenewalCycle`
- one child persistence entity: `RenewalAttempt`

The final approval strategy should be:
- current approval state lives on `RenewalCycle`
- approval audit summary also lives on `RenewalCycle`
- no separate approval event entity in MVP

This means:
- we do not model renewals only as subscription fields
- we do not store attempt history only in `metadata`
- we do not introduce a separate `renewal_event` stream in MVP

## 2. Why two persistence entities are preferred

Recommended model:
- `RenewalCycle`
- `RenewalAttempt`

Why this is preferred over a single `RenewalCycle` entity only:
- execution history has its own lifecycle and audit value
- retries must be traceable as separate records
- Admin detail needs an explicit attempt timeline
- keeping attempt history only on the cycle would make the read model and workflow logic harder to reason about

Why this is preferred over a larger event-style design:
- MVP needs operational clarity more than event-sourcing flexibility
- a separate event stream would add complexity without immediate product value
- cycle + attempt already covers queue state, history, and troubleshooting

## 3. Rejected alternatives

### 3.1 Single-entity design

Rejected option:
- only `RenewalCycle`, with attempt history in `metadata` or JSON arrays

Why it is worse:
- harder to audit
- harder to display attempt timelines
- weaker retry semantics
- more fragile for filtering and future analytics

### 3.2 Event-only design

Rejected option:
- `RenewalCycle`
- generic `RenewalEvent`
- optional `RenewalAttempt` derived from events

Why it is worse for MVP:
- too much indirection for the current Admin use case
- approval, retry, and order-generation semantics become harder to read
- greater implementation and read-model complexity

## 4. Final persistence model

The persistence layer should revolve around:
- one aggregate root: `RenewalCycle`
- one child history entity: `RenewalAttempt`

### 4.1 `RenewalCycle`

`RenewalCycle` is the queue and execution-state record.

### Proposed persisted fields

Plain fields:
- `id`
- `subscription_id`
- `scheduled_for`
- `processed_at`
- `status`
- `approval_status`
- `approval_required`
- `approval_decided_at`
- `approval_decided_by`
- `approval_reason`
- `generated_order_id`
- `last_error`
- `attempt_count`

JSON fields:
- `applied_pending_update_data`
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

### 4.2 `RenewalAttempt`

`RenewalAttempt` is the execution-history record.

### Proposed persisted fields

Plain fields:
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

JSON fields:
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

## 5. Why `approval_required` is explicit

The model should store both:
- `approval_required`
- `approval_status`

Why:
- `approval_status = null` is easier to interpret when it means “not decided or not applicable”, but Admin and workflows also need to know whether approval is required at all
- an explicit boolean avoids ambiguous semantics in queue processing
- filtering and operational decisions become simpler

Recommended meaning:
- `approval_required = false` means approval is not needed for this cycle
- `approval_required = true` means the cycle is governed by `approval_status`

## 6. Why approval metadata belongs on `RenewalCycle`

The MVP should keep approval metadata on `RenewalCycle`, not in a separate approval event entity.

Recommended fields:
- `approval_required`
- `approval_status`
- `approval_decided_at`
- `approval_decided_by`
- `approval_reason`

Why this is preferred:
- approval is current operational state of the cycle
- Admin list and detail need direct access to approval fields
- the workflow can update one entity as the aggregate root
- the current product scope does not require full approval-event sourcing

Rejected alternative:
- separate `RenewalApprovalEvent`

Why rejected:
- adds extra join and query complexity
- duplicates current-state reconstruction logic
- unnecessary until there is a real requirement for multiple approval decisions per cycle

## 7. Scalar vs JSON decisions

Use scalar columns for:
- identifiers
- statuses
- booleans
- timestamps
- queue-processing fields
- convenience fields used in filtering and sorting

Use JSON for:
- `applied_pending_update_data`
- `metadata`

Why:
- `applied_pending_update_data` is a structured snapshot of what was actually applied
- `metadata` is for flexible non-core extensions
- cycle and attempt statuses must remain explicit model fields, not JSON

## 8. `applied_pending_update_data`

This field should be stored on `RenewalCycle` as JSON.

Why:
- it is the execution snapshot of the approved change actually used in the cycle
- it is part of the cycle’s historical meaning
- it should remain available even if the subscription changes later

It should not be stored only on the subscription because:
- the subscription owns preview state
- the cycle owns execution history

## 9. Relation strategy inside the module

The relation between `RenewalCycle` and `RenewalAttempt` should be an internal same-module relationship.

Recommended semantics:
- one `RenewalCycle` has many `RenewalAttempt` records
- one `RenewalAttempt` belongs to one `RenewalCycle`

Why:
- this is a same-module data-model relationship
- Medusa module links are for cross-module isolation boundaries, not internal entity relationships

## 10. Relation strategy across modules

The `renewal` module should keep scalar IDs and also define module links to external modules where needed.

### `subscription_id`

`RenewalCycle` should store:
- `subscription_id` as a scalar field

And the module should later define:
- a module link between `renewal_cycle` and `subscription`

Why both are needed:
- scalar ID supports filtering, indexing, and queue operations
- module link supports cross-module reads without breaking isolation

### `generated_order_id`

`RenewalCycle` should store:
- `generated_order_id` as a scalar field

And the module should later define:
- a module link between `renewal_cycle` and `order`

Why:
- Admin list and detail should quickly expose the resulting order
- linked reads should still follow Medusa isolation rules

### `RenewalAttempt.order_id`

`RenewalAttempt` should store:
- `order_id` as a scalar field

Reason:
- an attempt may create or reference an order independently of the cycle summary
- troubleshooting should not require resolving the cycle’s final order only

### `payment_reference`

`payment_reference` should remain a scalar text field on `RenewalAttempt`.

Reason:
- it is operational diagnostic data
- it does not yet justify a dedicated link or relation in MVP

## 11. Snapshot and audit fields needed for Admin detail

For the current MVP, the data model should support Admin detail with:
- approval summary on the cycle
- applied pending-change snapshot on the cycle
- generated order reference on the cycle
- last error summary on the cycle
- attempt timeline data on the attempt entity

The model does not need to store full copies of:
- subscription snapshots again on the cycle
- product snapshots again on the cycle
- customer snapshots again on the cycle

Why:
- these already belong to `Subscription`
- duplication should be avoided unless execution history truly requires a detached copy
- current Admin detail can combine linked subscription context with cycle-specific execution data

## 12. Convenience fields

The final model should keep convenience fields on `RenewalCycle`:
- `last_error`
- `attempt_count`
- `generated_order_id`

Why:
- Admin queue rendering should not aggregate child records on every read
- jobs and retry logic should work from the cycle aggregate efficiently
- the cycle remains the operational root

## 13. Status ownership

### `RenewalCycle.status`

Owned by the cycle aggregate.

It answers:
- where the cycle is in its execution lifecycle

### `RenewalAttempt.status`

Owned by the attempt record.

It answers:
- the result of one concrete execution attempt

These statuses must remain separate.

The cycle status should not be inferred every time from attempt history alone.

## 14. Indexing implications

The final data model implies later indexes at least for:

`RenewalCycle`
- `subscription_id`
- `scheduled_for`
- `status`
- `approval_required`
- `approval_status`
- `generated_order_id`

`RenewalAttempt`
- `renewal_cycle_id`
- `attempt_no`
- `status`
- `started_at`
- `finished_at`

These indexes should support:
- queue selection
- Admin filtering
- detail loading
- attempt timeline ordering

## 15. Final recommendation

The recommended MVP persistence model is:

- `RenewalCycle`
  - aggregate root
  - current execution state
  - approval state
  - resulting order reference
  - applied pending-change snapshot
  - queue-friendly convenience fields

- `RenewalAttempt`
  - append-only child history
  - execution timestamps
  - technical failure context
  - payment and order references

No separate approval event entity is needed in MVP.

If the domain later requires:
- multiple approval actions
- richer audit trails
- operator comment timelines
- non-attempt operational events

then a `RenewalEvent`-style model can be introduced later without invalidating the core cycle + attempt structure.

## 16. Impact on later steps

This final model means:
- the `renewal` module implementation should export two data models
- same-module relationships should be used between cycle and attempt
- module links should later connect the cycle to `subscription` and `order`
- workflows should update the cycle aggregate and append attempts explicitly
- the Admin read model should use `RenewalCycle` as the root for list/detail and attach attempts for detail reads
