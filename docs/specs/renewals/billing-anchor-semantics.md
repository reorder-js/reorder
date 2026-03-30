# Reorder: Renewals Billing Anchor and Date Semantics Spec

This document covers step `2.3.8` from `documentation/implementation_plan.md`.

Goal:
- define how renewal dates are calculated and advanced
- define which field is the billing anchor source of truth
- define what happens after a successful renewal
- define what happens after a failed renewal attempt
- define how pause, cancel, trial, and skip flags affect scheduling
- define whether the scheduler processes only the current due cycle or also backlog cycles
- define how to avoid generating duplicate renewals for the same billing period

This specification builds on:
- `reorder/docs/specs/subscriptions/domain-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`
- `reorder/docs/specs/renewals/data-model.md`
- `reorder/docs/specs/renewals/state-machine.md`

The direction follows Medusa patterns:
- recurring scheduling should use explicit persisted date fields
- a successful workflow should update the next due date only after successful completion
- failed executions should not silently advance business periods
- idempotency and locking must protect one business period from duplicate processing

## 1. Core billing-anchor decision

The source of truth for the active billing anchor remains `Subscription.next_renewal_at`.

`RenewalCycle.scheduled_for` is not the long-term source of truth for a subscription’s cadence.

Instead:
- `Subscription.next_renewal_at` is the active due date for the next billable cycle
- `RenewalCycle.scheduled_for` is the cycle-level snapshot of the due date being processed

This split is intentional:
- the subscription owns future scheduling state
- the renewal cycle owns one execution unit

## 2. Which date fields matter

The relevant subscription fields are:

- `started_at`
- `next_renewal_at`
- `last_renewal_at`
- `paused_at`
- `cancelled_at`
- `cancel_effective_at`
- `skip_next_cycle`
- `is_trial`
- `trial_ends_at`

The relevant renewal field is:

- `scheduled_for`

## 3. How a renewal cycle is anchored

When a renewal cycle is created or selected for execution:
- `RenewalCycle.scheduled_for` should match the current due billing date represented by `Subscription.next_renewal_at`

This means one cycle represents one concrete billing period.

Important consequence:
- retries and force-renewal actions operate on the same billing period
- they do not create a new period with a new due date

## 4. How to calculate the next renewal date after success

After a successful renewal:
- `Subscription.last_renewal_at` should be set to the execution timestamp of the successful renewal
- `Subscription.next_renewal_at` should be advanced by the cadence that was actually active for the successful cycle

### Cadence source for date advancement

The next date should be calculated from:
- the subscription’s current active cadence before execution, or
- the approved pending cadence if that pending change was applied during the successful cycle

In practice:
- if no pending cadence change was applied, advance using the current subscription cadence
- if an approved cadence change was applied in the cycle, advance using the newly applied cadence

This keeps the next billing anchor aligned with the state that the successful renewal actually materialized.

## 5. Date advancement after failed execution

A failed renewal attempt must not advance the billing anchor.

After a failed attempt:
- `Subscription.next_renewal_at` remains unchanged
- `Subscription.last_renewal_at` remains unchanged
- the cycle remains associated with the same billing period

Why:
- the business period was not successfully billed
- advancing the next date would skip a cycle
- retry and force should continue working on the same due period

## 6. Pause semantics

If a subscription is `paused`:
- it is not eligible for normal renewal execution
- no new renewal cycle should be executed while the subscription remains paused

Recommended behavior:
- the active due anchor remains on the subscription
- resuming the subscription makes it eligible again according to later scheduler policy

This specification does not require immediate automatic catch-up on resume.

## 7. Cancel semantics

If a subscription is `cancelled`:
- no future renewal should be executed after cancellation becomes effective

Recommended interpretation:
- `cancel_effective_at` is the guard date for whether the next due cycle should still run
- if the due cycle falls after the effective cancellation point, it should not be executed

This keeps end-of-cycle cancellation distinct from immediate cancellation.

## 8. Trial semantics

If `is_trial = true` and the subscription is still within trial:
- the subscription is not yet eligible for a paid renewal execution

Recommended rule:
- a paid renewal order must not be generated before `trial_ends_at`

The first billable renewal period begins only once the trial gate is cleared.

This does not require a separate renewal state.

It is an eligibility rule evaluated before execution.

## 9. `skip_next_cycle` semantics

`skip_next_cycle` should affect exactly one upcoming billing period.

Recommended behavior:
- if `skip_next_cycle = true` when the subscription reaches its due date, the system consumes that due period without generating a renewal order
- the subscription’s billing anchor advances once
- `skip_next_cycle` is then cleared

Why:
- the flag should represent one skipped cycle, not an indefinite pause
- Admin and operators can reason about it as a one-time operational override

## 10. Whether to process backlog cycles

For MVP, the scheduler should process only the current due cycle, not historical backlog cycles in bulk.

Recommended policy:
- at most one open due cycle per subscription is processed at a time
- if a subscription is overdue for multiple theoretical periods, the system still works the single currently due anchor

Why this is preferred:
- simpler idempotency guarantees
- simpler queue behavior
- reduced risk of duplicate or burst order generation
- easier Admin operability

Backlog catch-up can be added later as an explicit policy, not as the default renewal behavior.

## 11. How to avoid duplicate renewals for the same period

The system should treat the tuple:

- `subscription_id`
- `scheduled_for`

as the business identity of one renewal period.

### Recommended duplicate-prevention rules

- there must not be more than one active renewal cycle representing the same `subscription_id + scheduled_for`
- scheduler retries and manual force actions must reuse the same cycle when targeting the same due period
- a successful cycle advances the anchor only once
- failed attempts do not create a new period

This prevents the same billing period from being billed twice.

## 12. Relationship between billing anchor and retries

Retries operate on execution attempts, not on billing periods.

That means:
- a retry creates or updates `RenewalAttempt` history
- it does not create a new `RenewalCycle` for a new period
- it does not advance `Subscription.next_renewal_at`

Only a successful completion should close the current period and move the anchor.

## 13. Suggested date-calculation rules

### Base cadence

The cadence comes from:
- `frequency_interval`
- `frequency_value`

Supported intervals remain:
- `week`
- `month`
- `year`

### Recommended next-date rule

After success:
- next date = `scheduled_for` advanced by the cadence that the successful cycle used

This is preferred over anchoring from the wall-clock execution timestamp because:
- it preserves cadence consistency
- it avoids drift when processing happens later than the nominal due time
- it better represents recurring billing periods

## 14. Handling late execution

If the scheduler or manual force runs later than the nominal due date:
- the cycle should still represent the original `scheduled_for` billing period
- success should advance from that scheduled anchor, not from the delayed execution time

Example:
- due date was April 1
- execution actually succeeded on April 3
- monthly cadence should still produce the next due date based on April 1, not April 3

This avoids billing-anchor drift over time.

## 15. Lifecycle examples

### 15.1 Successful monthly renewal

- subscription has `next_renewal_at = 2026-04-01`
- cycle is anchored at `scheduled_for = 2026-04-01`
- workflow succeeds on `2026-04-01`
- `last_renewal_at` becomes the success timestamp
- next anchor becomes `2026-05-01`

### 15.2 Failed renewal with retry

- subscription has `next_renewal_at = 2026-04-01`
- cycle anchored at `2026-04-01`
- first attempt fails
- `next_renewal_at` stays `2026-04-01`
- retry or force uses the same due cycle
- only after success is the anchor advanced

### 15.3 Skip-next-cycle

- subscription has `next_renewal_at = 2026-04-01`
- `skip_next_cycle = true`
- the system consumes the April cycle without creating an order
- `skip_next_cycle` is cleared
- next anchor advances to the next cadence date

### 15.4 Trial blocks paid renewal

- subscription is in trial and `trial_ends_at` is after the current due date
- renewal execution is blocked for paid billing
- no paid order is generated for that due point until trial eligibility rules are satisfied

## 16. Final recommendation

The recommended MVP date and anchor semantics are:

- `Subscription.next_renewal_at` is the active billing anchor
- `RenewalCycle.scheduled_for` is the snapshot of the current due period
- success advances the anchor exactly once
- failure does not advance the anchor
- retries and force operate on the same due period
- pause, cancel, and trial affect eligibility before execution
- `skip_next_cycle` consumes exactly one period
- the scheduler processes one current due cycle, not historical backlog bursts

This is preferred because it is operationally simple, aligns with Medusa’s explicit date-field approach, and minimizes duplicate-billing risk in the MVP renewal design.
