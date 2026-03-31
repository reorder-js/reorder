# Reorder: Dunning Domain Model Spec

This document covers step `2.4.3` from `documentation/implementation_plan.md`.

Goal:
- define the domain contract for `DunningCase`
- define the domain contract for `DunningAttempt`
- decide which data belongs to regular model fields
- decide which data should be stored as JSON snapshots or metadata
- provide a stable foundation for workflows, Admin reads, and retry scheduling

This specification builds on:
- `reorder/docs/specs/dunning/trigger-entry.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/renewals/domain-model.md`

The design follows Medusa patterns:
- a custom module owns one explicit operational aggregate
- fields used for filtering, sorting, scheduling, and state transitions should be stored explicitly
- retry history should be modeled as a separate entity when it has audit and operational value
- JSON is appropriate for retry policy snapshots and flexible diagnostics, not for primary state-machine fields

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for the domain contract
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. Architectural assumptions

The `Dunning` area has two conceptual levels:

- `DunningCase`
- `DunningAttempt`

`DunningCase` is the primary operational record persisted in the plugin module.

`DunningAttempt` is a child recovery-attempt record persisted separately from the case.

In practice:
- one case represents one failed collectible debt event for one subscription
- one case is anchored to one originating renewal cycle
- one case may have zero or more recovery attempts
- one case aggregates the current recovery state
- attempts preserve append-only recovery history

This split is intentional:
- the case is the queue and decision record
- attempts are the audit and troubleshooting trail

## 2. Responsibility boundaries

### `DunningCase`

`DunningCase` is responsible for:
- identifying the subscription under recovery
- identifying the originating renewal cycle
- storing the current lifecycle state of the recovery case
- storing retry counters and scheduling fields
- storing the latest payment recovery error summary
- storing the closure and recovery summary
- storing current convenience fields used by scheduling and Admin

`DunningCase` is not responsible for:
- the full lifecycle state of the subscription
- the execution state machine of the originating renewal cycle
- the full history of technical recovery attempts
- being the authoritative source of current payment-provider configuration

### `DunningAttempt`

`DunningAttempt` is responsible for:
- storing one concrete recovery attempt for one case
- recording start and finish timestamps
- recording success or failure of the attempt
- recording technical payment references and error details
- preserving troubleshooting and audit history

`DunningAttempt` is not responsible for:
- deciding whether a case should exist
- being the source of truth for case status
- replacing the aggregate state stored in `DunningCase`

## 3. Why two entities are preferred

The recommended domain structure uses:
- one primary entity: `DunningCase`
- one child entity: `DunningAttempt`

Why this is preferred:
- queue state and recovery history are different concerns
- Admin list and Admin detail have different read requirements
- multiple retries should not overwrite one mutable log field
- case-level filtering remains simple
- attempt-level audit stays append-only and explicit

Rejected alternative:
- store all retry history only in `DunningCase.metadata`

Why it is worse:
- harder to inspect operationally
- weaker auditability
- more difficult retry timeline rendering
- less aligned with the already established `Renewals` pattern

## 4. `DunningCase` domain contract

Minimal domain contract:

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

### Proposed logical shape

```ts
type DunningCase = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status:
    | "open"
    | "retry_scheduled"
    | "retrying"
    | "awaiting_manual_resolution"
    | "recovered"
    | "unrecovered"
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: string | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: string | null
  recovered_at: string | null
  closed_at: string | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
}
```

## 5. Regular `DunningCase` fields

The following fields should be regular model columns:

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

Why:
- they are needed for Admin filtering and sorting
- they are needed for retry scheduling and queue discovery
- they are needed for operational status transitions
- they are needed for uniqueness and closure rules
- they express explicit operational state rather than flexible configuration

## 6. Why the IDs should be scalar fields

The model should store these explicit scalar fields:

- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`

Why:
- they simplify filtering and indexing
- they simplify scheduler and Admin queries
- they preserve the same practical Medusa pattern already used in `Subscriptions` and `Renewals`
- module links can still be added later without losing efficient source-record access

## 7. `status`

`status` is the case-level state machine field.

It answers:
- what is the current operational state of the recovery case

It should be a scalar enum field, not JSON.

Why:
- case status drives scheduler eligibility
- case status drives Admin actions
- case status is a primary filtering and sorting field

The exact transition rules belong to a later step, but the domain contract should reserve these values:

- `open`
- `retry_scheduled`
- `retrying`
- `awaiting_manual_resolution`
- `recovered`
- `unrecovered`

## 8. `attempt_count`

`attempt_count` is a case-level convenience field.

Why it belongs on the case:
- retry policy depends on the number of attempts
- Admin list and detail should show a stable count without aggregating child records on every read
- scheduler logic should not need to query all attempts to know whether the limit is near or exceeded

Important note:
- `attempt_count` is derived from history in a business sense
- it still belongs as an explicit scalar field because it is operationally important

## 9. `max_attempts`

`max_attempts` is a case-level policy snapshot field, but it should still be stored explicitly as a scalar.

Why:
- it participates directly in retry eligibility
- Admin should display and filter against the current retry limit
- case behavior should remain stable even if default retry policy changes later

This means:
- `max_attempts` is not just global configuration
- it is the frozen limit that governs this case

## 10. `retry_schedule`

`retry_schedule` describes the retry policy snapshot assigned to this case.

### Proposed shape

```ts
type DunningRetrySchedule = {
  strategy: "fixed_intervals"
  intervals: number[]
  timezone: "UTC"
  source: "default_policy" | "manual_override"
}
```

Where:
- `intervals` are retry offsets in minutes from the previous failed attempt or case creation event

### Storage decision

`retry_schedule` should be stored as JSON.

Why:
- it is structured policy data rather than a single operational scalar
- the shape may evolve in later steps
- it should preserve the exact schedule snapshot assigned to the case
- scheduler execution will primarily use `next_retry_at`, not the entire schedule blob for list filtering

Important note:
- `retry_schedule` is the policy snapshot
- `next_retry_at` is the operational scheduling field

## 11. `next_retry_at`

`next_retry_at` is the scheduler-facing due-date field.

It should be stored explicitly as a scalar timestamp.

Why:
- scheduler discovery needs direct filtering by due date
- Admin list and detail should display the next scheduled retry
- filtering and sorting by due retry time should not depend on reading JSON

Important note:
- if the case is closed, `next_retry_at` should generally be `null`
- the authoritative rule for when it is set or cleared belongs to a later state-machine step

## 12. Latest error summary fields

The case should store:

- `last_payment_error_code`
- `last_payment_error_message`

These are case-level convenience fields.

Why they belong on the case:
- Admin list needs a compact failure summary
- scheduler and operational flows may need the latest error without reading all attempts
- they improve visibility without replacing attempt history

Important note:
- these fields are not the authoritative full error history
- detailed per-attempt error context belongs to `DunningAttempt`

## 13. `last_attempt_at`

`last_attempt_at` is a case-level convenience timestamp.

Why it belongs on the case:
- useful for Admin list sorting and review
- useful for scheduler guardrails and timeout reasoning
- avoids recomputing latest attempt time from child records on every read

## 14. Closure and recovery timestamps

The case should store:

- `recovered_at`
- `closed_at`

Why both exist:
- `recovered_at` answers when payment recovery succeeded
- `closed_at` answers when the case left the active state, whether by recovery or terminal closure

Recommended semantics:
- if the case closes as recovered, both may be set to the same timestamp
- if the case closes unrecovered, `closed_at` is set and `recovered_at` stays `null`

## 15. `recovery_reason`

`recovery_reason` should be a scalar nullable text field.

It stores the terminal or operator-facing reason for recovery outcome.

Examples:
- `payment_captured`
- `marked_recovered_by_admin`
- `max_attempts_exceeded`
- `marked_unrecovered_by_admin`

Why it should be scalar:
- it is important for Admin visibility
- it may be useful for filtering or later reporting
- it should not be buried in metadata

## 16. `metadata`

`metadata` remains a standard JSON field.

Why:
- this follows the Medusa pattern for extra non-core data
- it can store supplementary diagnostics or audit context
- it should not store primary state-machine fields, retry counters, or due dates

Examples of acceptable metadata:
- provider-specific recovery context
- operator notes not yet modeled explicitly
- experimental non-core diagnostic values

## 17. `DunningAttempt` domain contract

Minimal domain contract:

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

### Proposed logical shape

```ts
type DunningAttempt = {
  id: string
  dunning_case_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: "processing" | "succeeded" | "failed"
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  metadata: Record<string, unknown> | null
}
```

## 18. Regular `DunningAttempt` fields

The following fields should be regular model columns:

- `id`
- `dunning_case_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`

Why:
- attempts must be ordered and auditable
- attempt records should support direct retrieval and timeline rendering
- these fields are operational attempt data, not flexible metadata

## 19. `DunningAttempt.metadata`

`DunningAttempt.metadata` is optional and should remain flexible.

Examples of acceptable metadata:
- provider response details not needed in standard Admin list views
- request correlation IDs
- non-core diagnostic context from one attempt

It should not store:
- the primary attempt status
- the primary attempt timestamps
- the main error summary fields already modeled explicitly

## 20. Why attempt history should not live only on the case

Rejected option:
- store retry history only inside `DunningCase.retry_schedule` or `metadata`

Why it is worse:
- weak operational auditability
- poor Admin detail UX
- harder reasoning about retries and failures
- inconsistent with the already established `RenewalCycle` / `RenewalAttempt` pattern

The plugin should preserve symmetry where it is useful:
- `RenewalCycle` + `RenewalAttempt`
- `DunningCase` + `DunningAttempt`

## 21. Final decision summary

For step `2.4.3`, the final decisions are:

- `DunningCase` is the primary operational record
- `DunningAttempt` is the append-only child history record
- status, counters, IDs, due dates, latest error summary, and closure timestamps should be explicit scalar fields
- `retry_schedule` should be stored as a JSON policy snapshot
- `metadata` remains flexible and non-core
- attempt-level technical history should live on `DunningAttempt`, not only on the case
