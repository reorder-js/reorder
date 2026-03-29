# Reorder: Renewals State Machine Spec

This document covers step `2.3.7` from `documentation/implementation_plan.md`.

Goal:
- define the business status model for `RenewalCycle`
- define the execution status model for `RenewalAttempt`
- define legal and illegal state transitions
- define how approval gating interacts with renewal execution
- define retry and force-renewal semantics
- define when a cycle is considered closed after success or failure

This specification builds on:
- `reorder/docs/specs/renewals_domain_model_spec.md`
- `reorder/docs/specs/renewals_source_of_truth_semantics_spec.md`
- `reorder/docs/specs/renewals_data_model_spec.md`

The direction follows Medusa patterns:
- workflow-engine retry state is not the same as domain state
- approval should be modeled separately from execution status
- scheduled jobs and manual actions should reuse the same core workflow
- operational state should stay explicit and queryable

## 1. State model overview

The `Renewals` area uses three separate state dimensions:

- `RenewalCycle.status`
- `RenewalCycle.approval_status`
- `RenewalAttempt.status`

These dimensions must not be collapsed into one field.

Why:
- execution state answers whether the cycle is currently queued, running, or finished
- approval state answers whether pending changes may be applied for this cycle
- attempt state answers what happened in one concrete execution attempt

## 2. `RenewalCycle.status`

`RenewalCycle.status` is the aggregate execution status of one renewal unit.

### Allowed values

- `scheduled`
- `processing`
- `succeeded`
- `failed`

### Meaning of each value

#### `scheduled`

The cycle exists and is eligible to be considered for execution.

This does not guarantee that execution can start immediately.

The cycle may still be blocked by:
- approval requirements
- ineligibility of the subscription
- force-renewal rules
- idempotency or locking guards

#### `processing`

The cycle is currently being executed by the core renewal workflow.

This status means:
- one execution is in flight
- no competing scheduler or manual force execution should start another one
- the cycle is under lock or equivalent concurrency protection

#### `succeeded`

The cycle completed successfully.

This status means:
- the renewal order was generated successfully
- subscription updates for this cycle were applied successfully
- the cycle is terminal for normal execution

#### `failed`

The latest execution attempt ended in failure.

In MVP, `failed` means the cycle did not succeed on its latest attempt.

It does not automatically mean:
- the cycle is permanently unrecoverable
- retries are no longer possible

Whether the cycle may be retried depends on workflow policy, retry limits, and force rules.

## 3. `RenewalCycle.approval_status`

`RenewalCycle.approval_status` is a separate governance state.

It only matters when `approval_required = true`.

### Allowed values

- `null`
- `pending`
- `approved`
- `rejected`

### Recommended semantics

- `null`: approval is not required for this cycle, or no approval state applies
- `pending`: approval is required and not yet decided
- `approved`: approval was granted for this cycle
- `rejected`: approval was denied for this cycle

Approval state is not an execution status.

For example:
- a cycle may be `scheduled` and `pending`
- a cycle may be `scheduled` and `approved`
- a cycle may be `failed` and `approved`

## 4. `RenewalAttempt.status`

`RenewalAttempt.status` is the execution status of one concrete attempt.

### Allowed values

- `processing`
- `succeeded`
- `failed`

### Why no `scheduled` on attempts

`RenewalAttempt` should only be created when execution actually begins.

Because of that:
- queue state belongs to `RenewalCycle`
- in-flight and finished execution belongs to `RenewalAttempt`

## 5. Legal `RenewalCycle.status` transitions

Recommended legal transitions:

- `scheduled -> processing`
- `processing -> succeeded`
- `processing -> failed`
- `failed -> processing`

### `scheduled -> processing`

Allowed when:
- the subscription is eligible for renewal
- approval gating is satisfied
- no duplicate execution is already in progress
- the cycle is selected by the scheduler or a valid force action

### `processing -> succeeded`

Allowed when:
- the renewal workflow completes successfully
- order generation succeeds
- subscription updates and cycle finalization succeed

### `processing -> failed`

Allowed when:
- the renewal workflow reaches a business or technical failure that ends the current attempt

Typical examples:
- order creation failure
- payment failure
- subscription no longer eligible
- offer-policy validation failure at execution time

### `failed -> processing`

Allowed when:
- retry policy allows another attempt
- the scheduler retries the cycle or an admin uses force renewal
- approval gating is satisfied for the new attempt
- the cycle is not already locked by another execution

## 6. Illegal `RenewalCycle.status` transitions

The following transitions should be treated as invalid:

- `scheduled -> succeeded`
- `scheduled -> failed`
- `succeeded -> processing`
- `succeeded -> failed`
- `failed -> succeeded`

Why:
- all outcome states must pass through `processing`
- a succeeded cycle is closed for normal execution
- success cannot be asserted without an actual execution attempt

## 7. Approval gating rules

Approval is an execution gate, not a status replacement.

### If `approval_required = false`

The cycle may proceed according to normal execution rules.

Recommended approval shape:
- `approval_status = null`

### If `approval_required = true`

The cycle is governed by `approval_status`.

#### `approval_status = pending`

The cycle must not transition from `scheduled` to `processing` for an execution that would apply pending changes.

This is the primary approval-blocked state.

#### `approval_status = approved`

The cycle may proceed to execution if all other eligibility checks pass.

#### `approval_status = rejected`

The cycle must not execute with the pending change payload that required approval.

For MVP, the recommended behavior is:
- the cycle remains non-executable for the approval-governed change set
- the workflow or later business rules may decide whether the cycle is rescheduled without those changes
- `rejected` does not itself mean the cycle executed or failed

## 8. Retry semantics

Retry behavior should combine:
- domain state on `RenewalCycle`
- execution history on `RenewalAttempt`
- workflow-engine retry configuration for temporary step failures

### Domain interpretation

After a failed attempt:
- the cycle status becomes `failed`
- `last_error` is updated
- `attempt_count` is incremented
- a failed `RenewalAttempt` record is preserved

### Workflow-engine interpretation

Inside the workflow:
- individual steps may use Medusa retry features such as `maxRetries`
- step retries do not need separate cycle statuses
- the business state should only reflect the final result of the attempt

This keeps domain state simple while still using Medusa workflow resilience.

### Retry rule summary

In MVP:
- `failed` means the last attempt failed
- retry eligibility is determined by policy and execution guards
- retry does not require a separate domain status like `retrying` or `exhausted`

Later phases such as dunning may extend the policy without changing the core state model.

## 9. Force-renewal semantics

Manual force renewal must reuse the same core execution workflow as the scheduler.

It should differ only in:
- who initiated the execution
- whether the action bypasses schedule timing
- which policy checks are relaxed or preserved

### Recommended force rules

Force renewal may be allowed for:
- `scheduled` cycles that are otherwise executable
- `failed` cycles that are eligible for another attempt

Force renewal must be blocked for:
- `processing` cycles
- `succeeded` cycles
- cycles blocked by unresolved required approval

Force renewal must still respect:
- locking
- idempotency
- subscription eligibility
- current offer-policy validation when pending changes are applied

## 10. Closure rules

The cycle should be considered closed for normal execution when:
- `status = succeeded`

The cycle should also be treated as closed for the current attempt when:
- `status = failed`

However, in MVP `failed` is not automatically a permanently closed business state.

It is better interpreted as:
- the current attempt is closed
- the cycle may still be reopened to `processing` by retry or force rules

This preserves flexibility for later dunning behavior without changing the base model.

## 11. Suggested lifecycle examples

### 11.1 Successful scheduled renewal

- cycle created as `scheduled`
- approval not required, so `approval_status = null`
- scheduler starts execution: `scheduled -> processing`
- attempt record created as `processing`
- workflow succeeds
- attempt becomes `succeeded`
- cycle becomes `succeeded`

### 11.2 Renewal blocked by pending approval

- cycle created as `scheduled`
- `approval_required = true`
- `approval_status = pending`
- scheduler sees the cycle but must not execute it
- admin approves changes
- `approval_status = approved`
- scheduler or force action may transition the cycle to `processing`

### 11.3 Failed renewal followed by retry

- cycle starts as `scheduled`
- execution starts: `scheduled -> processing`
- attempt fails
- attempt becomes `failed`
- cycle becomes `failed`
- retry policy permits another execution
- cycle re-enters `processing`
- a new attempt record is created

## 12. Domain-error implications

The later workflow and API implementation should expose consistent domain errors for:

- invalid status transition
- renewal already processing
- renewal already succeeded
- approval required before execution
- approval already decided
- cycle not eligible for retry
- duplicate execution blocked by lock or idempotency guard

## 13. Final recommendation

The recommended MVP state machine is:

- `RenewalCycle.status`: `scheduled | processing | succeeded | failed`
- `RenewalCycle.approval_status`: `null | pending | approved | rejected`
- `RenewalAttempt.status`: `processing | succeeded | failed`

This is preferred because:
- it is simple enough for Medusa workflow orchestration
- it keeps approval orthogonal to execution
- it supports scheduler and manual force through one shared workflow
- it leaves room for later dunning logic without redesigning the core model
