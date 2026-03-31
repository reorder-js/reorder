# Reorder: Dunning State Machine Spec

This document covers step `2.4.6` from `documentation/implementation_plan.md`.

Goal:
- define the business status model for `DunningCase`
- define the execution status model for `DunningAttempt`
- define legal and illegal state transitions
- define how retry scheduling interacts with case lifecycle
- define closure semantics after recovery or retry exhaustion
- define rules for manual `mark-recovered` and `mark-unrecovered`

This specification builds on:
- `reorder/docs/specs/dunning/domain-model.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/data-model.md`

The direction follows Medusa patterns:
- workflow-engine retry state is not the same as domain state
- operational case state should stay explicit and queryable
- scheduler-facing due-date fields should not replace business lifecycle fields
- manual admin actions should reuse the same domain rules rather than inventing parallel semantics

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for status and transition semantics
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. State model overview

The `Dunning` area uses two separate state dimensions:

- `DunningCase.status`
- `DunningAttempt.status`

These dimensions must not be collapsed into one field.

Why:
- case status answers whether the debt event is open, scheduled for retry, currently retrying, or closed
- attempt status answers what happened in one concrete recovery attempt

Workflow-engine retry internals must remain separate from these domain states.

## 2. `DunningCase.status`

`DunningCase.status` is the aggregate recovery status of one failed collectible debt event.

### Allowed values

- `open`
- `retry_scheduled`
- `retrying`
- `awaiting_manual_resolution`
- `recovered`
- `unrecovered`

### Meaning of each value

#### `open`

The case exists and is active, but no retry is currently in flight and no next retry has yet been scheduled.

This is primarily an entry or staging state.

Typical examples:
- the case has just been created from a qualifying failed renewal
- the system still needs to compute the first retry schedule
- the case is active but has not yet been placed into timed retry

#### `retry_scheduled`

The case is active and the next retry is explicitly scheduled.

This means:
- the debt event remains recoverable
- the case is expected to be picked by the dunning scheduler or a manual retry action later
- `next_retry_at` should be present

#### `retrying`

The case is currently being processed by a recovery attempt.

This means:
- one retry execution is in flight
- no competing retry execution should start for the same case
- the case is under lock or equivalent concurrency protection

#### `awaiting_manual_resolution`

The case is active, but automated retry should not continue until a human decision or external customer action occurs.

Typical examples:
- the payment method likely needs replacement
- policy does not allow further automatic retries for the current state
- the provider outcome indicates manual intervention is more appropriate than immediate auto-retry

#### `recovered`

The case has closed successfully.

This means:
- payment recovery succeeded or the case was legitimately marked as recovered
- the debt event is no longer active in dunning
- the case is terminal

#### `unrecovered`

The case has closed unsuccessfully.

This means:
- the debt event is no longer active in dunning
- recovery did not succeed and the case is terminal
- closure may happen after retry exhaustion or explicit manual operator decision

## 3. Is `retry_scheduled` explicit or derived?

### Final decision

`retry_scheduled` should be an explicit domain status, not only derived state.

Why this is preferred:
- the Admin queue benefits from a directly queryable lifecycle state
- the scheduler should distinguish “active but not yet scheduled” from “active and intentionally queued for retry”
- `next_retry_at` alone does not fully describe business intent
- this keeps the model clearer for manual actions and operational reasoning

### Role of `next_retry_at`

`next_retry_at` remains a scheduler-facing operational field.

It answers:
- when the scheduled retry is due

It does not replace:
- whether the case is actually in retry-scheduled lifecycle state

Recommended interpretation:
- `status = retry_scheduled` and `next_retry_at != null` means a queued retry exists
- `status = open` and `next_retry_at = null` means active but not yet placed into timed retry

## 4. `DunningAttempt.status`

`DunningAttempt.status` is the execution status of one concrete recovery attempt.

### Allowed values

- `processing`
- `succeeded`
- `failed`

### Why no `scheduled` on attempts

`DunningAttempt` should only be created when recovery execution actually begins.

Because of that:
- queue state belongs to `DunningCase`
- in-flight and finished execution belongs to `DunningAttempt`

## 5. Legal `DunningCase.status` transitions

Recommended legal transitions:

- `open -> retry_scheduled`
- `open -> retrying`
- `open -> awaiting_manual_resolution`
- `open -> recovered`
- `open -> unrecovered`
- `retry_scheduled -> retrying`
- `retry_scheduled -> awaiting_manual_resolution`
- `retry_scheduled -> recovered`
- `retry_scheduled -> unrecovered`
- `retrying -> retry_scheduled`
- `retrying -> awaiting_manual_resolution`
- `retrying -> recovered`
- `retrying -> unrecovered`
- `awaiting_manual_resolution -> retry_scheduled`
- `awaiting_manual_resolution -> recovered`
- `awaiting_manual_resolution -> unrecovered`

### `open -> retry_scheduled`

Allowed when:
- the case is active
- retry policy has determined a next retry
- `next_retry_at` has been set

### `open -> retrying`

Allowed when:
- the first retry starts immediately
- a manual retry-now action starts the first execution without waiting for schedule
- concurrency and lock guards allow execution

### `open -> awaiting_manual_resolution`

Allowed when:
- the case should remain active but auto-retry is not appropriate yet
- manual review or customer action is required before continuing

### `open -> recovered`

Allowed when:
- the debt event is resolved without entering timed retry
- an immediate retry succeeds
- an admin legitimately marks the case recovered

### `open -> unrecovered`

Allowed when:
- policy determines the case should close without retry
- an admin legitimately marks the case unrecovered

### `retry_scheduled -> retrying`

Allowed when:
- the scheduler picks up the due case
- a manual retry-now action starts execution before or instead of waiting for due time
- the case is not already locked by another execution

### `retry_scheduled -> awaiting_manual_resolution`

Allowed when:
- policy or operator review decides automated retry should stop for now
- a new provider or business signal requires manual intervention

### `retrying -> retry_scheduled`

Allowed when:
- the latest retry attempt failed
- the case remains eligible for another automatic retry
- the retry policy sets a new `next_retry_at`
- `attempt_count` remains below the final closure threshold

### `retrying -> awaiting_manual_resolution`

Allowed when:
- the latest retry failed
- the failure indicates manual intervention is now required
- the case should remain open but should not auto-schedule another retry yet

### `retrying -> recovered`

Allowed when:
- the latest retry succeeds
- recovery finalization succeeds

### `retrying -> unrecovered`

Allowed when:
- the latest retry fails
- no further retries are allowed
- `max_attempts` is exhausted
- or policy explicitly closes the case as terminally unrecoverable

### `awaiting_manual_resolution -> retry_scheduled`

Allowed when:
- a human decision re-enables automated retry
- a payment-method or provider issue was resolved
- a new `next_retry_at` is assigned

### `awaiting_manual_resolution -> recovered`

Allowed when:
- the operator determines the debt is resolved
- or a manual recovery action succeeds

### `awaiting_manual_resolution -> unrecovered`

Allowed when:
- the operator determines the case should be closed without recovery

## 6. Illegal `DunningCase.status` transitions

The following transitions should be treated as invalid:

- `retry_scheduled -> open`
- `retrying -> open`
- `recovered -> open`
- `recovered -> retry_scheduled`
- `recovered -> retrying`
- `recovered -> awaiting_manual_resolution`
- `recovered -> unrecovered`
- `unrecovered -> open`
- `unrecovered -> retry_scheduled`
- `unrecovered -> retrying`
- `unrecovered -> awaiting_manual_resolution`
- `unrecovered -> recovered`

Why:
- terminal states should remain terminal in MVP
- once the case leaves active scheduling, it should not silently revert to the initial open state
- reopening a closed case would blur debt-event history and is better handled by creating a new future case from a new debt event

## 7. Retry semantics

Retry behavior should combine:
- domain state on `DunningCase`
- execution history on `DunningAttempt`
- workflow-engine retry configuration for transient step failures

### Domain interpretation

After a failed retry attempt:
- the attempt becomes `failed`
- the case remains active unless closure rules are met
- the case either transitions to `retry_scheduled`, `awaiting_manual_resolution`, or `unrecovered`
- `last_payment_error_code` and `last_payment_error_message` are updated
- `last_attempt_at` is updated
- `attempt_count` is incremented

### Workflow-engine interpretation

Inside the workflow:
- individual steps may use Medusa retry features such as `maxRetries`
- step retries do not need separate case statuses
- the business state should only reflect the final result of the recovery attempt

This keeps the domain state simple while still using Medusa workflow resilience.

## 8. Retry success rules

When a retry succeeds:
- the current `DunningAttempt` becomes `succeeded`
- the case transitions to `recovered`
- `recovered_at` is set
- `closed_at` is set
- `next_retry_at` is cleared
- `recovery_reason` should capture the successful resolution path

Recommended examples for `recovery_reason`:
- `payment_captured`
- `manual_retry_succeeded`

## 9. Retry failure rules

When a retry fails:

### If another automatic retry is allowed

- the current attempt becomes `failed`
- the case transitions to `retry_scheduled`
- `next_retry_at` is recalculated
- latest error summary fields are updated

### If automatic retry should stop but the case remains open

- the current attempt becomes `failed`
- the case transitions to `awaiting_manual_resolution`
- `next_retry_at` is cleared

### If no further retry is allowed

- the current attempt becomes `failed`
- the case transitions to `unrecovered`
- `closed_at` is set
- `next_retry_at` is cleared
- `recovery_reason` should capture the terminal cause

Recommended examples for terminal unrecovered reason:
- `max_attempts_exceeded`
- `provider_decline_terminal`
- `marked_unrecovered_by_admin`

## 10. Closure rules

The case should be considered closed when:
- `status = recovered`
- `status = unrecovered`

Closed means:
- no further automatic retries are allowed
- no new `DunningAttempt` should be created
- manual retry actions must be blocked

The case should remain active when:
- `status = open`
- `status = retry_scheduled`
- `status = retrying`
- `status = awaiting_manual_resolution`

## 11. Max-attempt semantics

`max_attempts` is a case-level limit on concrete recovery attempts.

Recommended rule:
- only real `DunningAttempt` executions count toward `attempt_count`
- scheduler discovery by itself does not increment attempts
- manual mark actions do not count as retry attempts unless they execute a real payment recovery

When `attempt_count` reaches `max_attempts` and the latest retry still fails:
- the case should transition to `unrecovered`
- further retry scheduling must be blocked

## 12. Manual action semantics

Manual admin actions must follow the same state model.

### `mark-recovered`

Recommended allowed source states:
- `open`
- `retry_scheduled`
- `awaiting_manual_resolution`

Conditionally allowed from:
- `retrying` only if no retry is actually in flight, which in practice should be treated as blocked

Blocked from:
- `recovered`
- `unrecovered`

Effects:
- case transitions to `recovered`
- `recovered_at` is set
- `closed_at` is set
- `next_retry_at` is cleared
- `recovery_reason = marked_recovered_by_admin`

### `mark-unrecovered`

Recommended allowed source states:
- `open`
- `retry_scheduled`
- `awaiting_manual_resolution`

Blocked from:
- `retrying`
- `recovered`
- `unrecovered`

Effects:
- case transitions to `unrecovered`
- `closed_at` is set
- `next_retry_at` is cleared
- `recovery_reason = marked_unrecovered_by_admin`

### Why manual actions are blocked during `retrying`

Because:
- the case already has an in-flight recovery execution
- manual closure during active execution would create ambiguous ownership of the outcome
- the workflow lock and case state should remain the source of truth

## 13. Suggested lifecycle examples

### 13.1 Case created after failed renewal payment

- case created as `open`
- latest payment error is recorded
- retry policy computes first retry
- case transitions to `retry_scheduled`

### 13.2 Retry succeeds

- case is `retry_scheduled`
- scheduler starts execution: `retry_scheduled -> retrying`
- attempt record created as `processing`
- recovery succeeds
- attempt becomes `succeeded`
- case becomes `recovered`

### 13.3 Retry fails and another retry is allowed

- case is `retry_scheduled`
- scheduler starts execution: `retry_scheduled -> retrying`
- attempt fails
- attempt becomes `failed`
- policy allows another retry
- case becomes `retry_scheduled`
- a new `next_retry_at` is stored

### 13.4 Retry fails and case becomes terminal

- case is `retry_scheduled`
- scheduler starts execution: `retry_scheduled -> retrying`
- attempt fails
- attempt becomes `failed`
- `attempt_count` reached `max_attempts`
- case becomes `unrecovered`

### 13.5 Manual close after review

- case is `awaiting_manual_resolution`
- admin decides recovery should not continue
- case transitions to `unrecovered`

## 14. Domain-error implications

The later workflow and API implementation should expose consistent domain errors for:

- invalid status transition
- case already retrying
- case already recovered
- case already unrecovered
- retry not due when scheduler semantics require due time
- retry blocked by max-attempt policy
- manual close blocked while retry is in progress

## 15. Final recommendation

The recommended MVP state machine is:

- `DunningCase.status`:
  - `open`
  - `retry_scheduled`
  - `retrying`
  - `awaiting_manual_resolution`
  - `recovered`
  - `unrecovered`
- `DunningAttempt.status`:
  - `processing`
  - `succeeded`
  - `failed`

This is preferred because:
- it keeps recovery lifecycle explicit and queryable
- it keeps retry scheduling separate from workflow-engine retry internals
- it supports both scheduler-driven and manual admin flows
- it preserves a clear distinction between active and terminal recovery states
