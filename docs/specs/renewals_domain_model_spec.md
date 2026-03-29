# Reorder: Renewals Domain Model Spec

This document covers step `2.3.2` from `documentation/implementation_plan.md`.

Goal:
- define the domain contract for `RenewalCycle`
- define the domain contract for `RenewalAttempt`
- decide which data belongs to regular model fields
- decide which data can be stored as JSON snapshots or metadata
- provide a stable foundation for workflows, Admin read models, and scheduled processing

The design follows Medusa patterns:
- a custom module owns its operational domain
- fields used for filtering, sorting, and queue processing should be stored explicitly
- flexible or snapshot-style data can be stored as JSON
- execution history should be modeled as a separate entity when it has its own lifecycle and audit value

## 1. Architectural assumptions

The `Renewals` area has two conceptual levels:

- `RenewalCycle`
- `RenewalAttempt`

`RenewalCycle` is the primary operational record persisted in the plugin module.

`RenewalAttempt` is a child execution-history record persisted separately from the cycle.

In practice:
- one cycle represents one scheduled renewal unit for one subscription
- one cycle may have zero or more attempts
- a cycle aggregates current operational state
- attempts preserve append-only execution history

This split is intentional:
- the cycle is the queue and decision record
- attempts are the audit and troubleshooting trail

## 2. Responsibility boundaries

### `RenewalCycle`

`RenewalCycle` is responsible for:
- identifying the subscription being renewed
- identifying when the cycle is scheduled to run
- storing the current lifecycle state of the cycle
- storing approval state for pending changes when approval is required
- storing the generated renewal order reference
- storing the snapshot of approved pending changes that were actually applied
- storing current convenience fields used by queue processing and Admin

`RenewalCycle` is not responsible for:
- the full lifecycle state of the subscription
- the source of commercial policy for the subscription
- the full history of technical execution attempts
- direct payment-provider semantics

### `RenewalAttempt`

`RenewalAttempt` is responsible for:
- storing one concrete execution attempt for one cycle
- recording start and finish timestamps
- recording success or failure of the attempt
- recording technical payment or order references
- preserving troubleshooting and audit history

`RenewalAttempt` is not responsible for:
- deciding whether the cycle is eligible for renewal
- being the source of truth for approval state
- replacing the aggregate state stored in `RenewalCycle`

## 3. Why two entities are preferred

The recommended domain structure uses:
- one primary entity: `RenewalCycle`
- one child entity: `RenewalAttempt`

Why this is preferred:
- queue state and execution history are different concerns
- Admin queue and Admin detail have different read requirements
- retries and multiple failures should not overwrite one mutable log field
- cycle-level filtering remains simple
- attempt-level audit stays append-only and explicit

Rejected alternative:
- store all attempt history only in `RenewalCycle.metadata`

Why it is worse:
- harder to filter or inspect operationally
- weaker auditability
- more complicated read-model mapping
- less aligned with Medusa-style explicit domain records

## 4. `RenewalCycle` domain contract

Minimal domain contract:

- `id`
- `subscription_id`
- `scheduled_for`
- `processed_at`
- `status`
- `approval_status`
- `generated_order_id`
- `applied_pending_update_data`
- `last_error`
- `attempt_count`
- `metadata`

### Proposed logical shape

```ts
type RenewalCycle = {
  id: string
  subscription_id: string
  scheduled_for: string
  processed_at: string | null
  status: "scheduled" | "processing" | "succeeded" | "failed"
  approval_status: "pending" | "approved" | "rejected" | null
  generated_order_id: string | null
  applied_pending_update_data: RenewalAppliedPendingUpdateData | null
  last_error: string | null
  attempt_count: number
  metadata: Record<string, unknown> | null
}
```

## 5. Regular `RenewalCycle` fields

The following fields should be regular model columns:

- `id`
- `subscription_id`
- `scheduled_for`
- `processed_at`
- `status`
- `approval_status`
- `generated_order_id`
- `last_error`
- `attempt_count`

Why:
- they are needed for Admin filtering and sorting
- they are needed for scheduled queue processing
- they are needed for idempotency, retry logic, and current-state reads
- they express explicit operational state rather than flexible configuration

## 6. `applied_pending_update_data`

`applied_pending_update_data` describes the pending change snapshot that was actually used during renewal processing.

### Proposed shape

```ts
type RenewalAppliedPendingUpdateData = {
  variant_id: string
  variant_title: string
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  effective_at: string | null
}
```

### Storage decision

`applied_pending_update_data` should be stored as JSON.

Why:
- it is a snapshot of a structured business object
- it should preserve what was applied at execution time
- its shape is stable enough to be validated, but still grouped naturally as one object
- it should not be reconstructed from a live subscription read later

### Domain rules

- it is nullable when no pending changes were applied
- if stored, it must represent the exact approved change materialized during the cycle
- it is a snapshot, not a live pointer back to the current subscription state

## 7. `last_error`

`last_error` is a cycle-level convenience field.

It should store a compact summary of the last known failure for operational display and queue processing.

Why it belongs on the cycle:
- Admin queue views need a direct failure summary
- jobs and retries should not need to inspect the full attempts collection for the latest error
- it improves read performance and operational visibility

Important note:
- `last_error` is not the authoritative history of failures
- detailed error history belongs to `RenewalAttempt`

## 8. `attempt_count`

`attempt_count` is a cycle-level convenience field.

Why it belongs on the cycle:
- retry policy and queue logic often depend on the number of attempts
- Admin list and detail should show a stable count without aggregating child records on every read

Important note:
- `attempt_count` is derived from cycle execution history in a business sense
- it still belongs as an explicit scalar field because it is operationally important

## 9. `metadata`

`metadata` remains a standard JSON field.

Why:
- this follows the Medusa pattern for extra non-core data
- it can store supplementary audit or operational context
- it should not store fields needed for primary filtering, sorting, or state transitions

## 10. `RenewalAttempt` domain contract

Minimal domain contract:

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

### Proposed logical shape

```ts
type RenewalAttempt = {
  id: string
  renewal_cycle_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: "processing" | "succeeded" | "failed"
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  order_id: string | null
  metadata: Record<string, unknown> | null
}
```

## 11. Regular `RenewalAttempt` fields

The following fields should be regular model columns:

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

Why:
- attempts must be ordered and auditable
- attempt records should support direct retrieval and timeline rendering
- these fields are operational data, not flexible metadata

## 12. `RenewalAttempt` metadata

`RenewalAttempt.metadata` is optional and should remain flexible.

Examples of acceptable metadata:
- provider-specific response references
- raw troubleshooting context not needed for standard Admin filtering
- non-core diagnostic values

It should not store:
- the primary attempt status
- timestamps used in the timeline
- identifiers required for linking attempts to cycles or orders

## 13. Relationship semantics

The domain relationship is:
- one `RenewalCycle` has many `RenewalAttempt` records
- one `RenewalAttempt` belongs to one `RenewalCycle`

Meaning:
- `RenewalCycle` is the aggregate root for operational reads and decisions
- `RenewalAttempt` is the execution log child entity

### Cycle-level convenience fields vs attempt history

The recommended split is:
- `RenewalCycle.last_error` stores only the latest summary
- `RenewalCycle.attempt_count` stores only the current count
- `RenewalAttempt` stores the actual history of execution

This keeps current-state reads fast without losing auditability.

## 14. Approval semantics

`approval_status` belongs to `RenewalCycle`, not to `RenewalAttempt`.

Why:
- approval is a business decision on whether the cycle may apply pending changes
- approval is a property of the cycle as a whole
- attempts execute under the cycle’s approval state, but do not own it

Recommended semantics:
- `null` means approval is not required for this cycle
- `pending` means approval is required and not decided yet
- `approved` means the cycle may apply pending changes
- `rejected` means the cycle must not apply pending changes

## 15. Order semantics

`generated_order_id` belongs to `RenewalCycle`.

Why:
- a successful cycle should expose the resulting order directly
- Admin list and detail views should not depend on scanning attempts to find the winning order

`RenewalAttempt.order_id` remains useful because:
- attempts may fail before order creation
- troubleshooting may require knowing which attempt created or tried to create an order
- the cycle should still keep the final result as a convenience field

## 16. Source-of-truth guidance

The `Renewals` module should treat:
- `RenewalCycle` as the source of truth for current operational renewal state
- `RenewalAttempt` as the source of truth for execution history

It should not treat:
- `Subscription.pending_update_data` as the historical source of what was applied
- a generated renewal order as the source of truth for cycle state

This is why `applied_pending_update_data` must be persisted on the cycle when used.

## 17. Scalar vs JSON summary

Use scalar fields for:
- identifiers
- statuses
- timestamps
- counters
- queue-processing fields
- fields used in filtering and sorting

Use JSON for:
- `applied_pending_update_data`
- `metadata`

This matches Medusa best practices:
- explicit structured state for core operations
- flexible JSON only for snapshots or supplementary context

## 18. Impact on later steps

This contract implies:
- the next step must decide how to map these contracts into final persistence models
- the read model should treat `RenewalCycle` as the list/detail root
- attempt history should be queried separately or joined as a child collection for detail views
- workflow design must update both cycle state and attempt history consistently

It also implies that later Admin DTOs and workflows should avoid collapsing attempt history into one mutable cycle field.
