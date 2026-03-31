# Reorder: Cancellation & Retention Lifecycle Semantics Spec

This document covers step `2.5.8` from `documentation/implementation_plan.md`.

Goal:
- define the business semantics of `paused` vs `retained` vs `canceled`
- decide whether `pause` is a retention outcome, a subscription lifecycle state, or both
- define when `cancel_effective_at` is set
- define when `next_renewal_at` and future `RenewalCycle` records are preserved, blocked, or cleared

This specification builds on:
- `reorder/docs/specs/subscriptions/domain-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`
- `reorder/docs/specs/renewals/billing-anchor-semantics.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/state-machine.md`

The direction follows Medusa patterns:
- the process aggregate should own process outcome state
- the subscription aggregate should own final lifecycle state and scheduling anchors
- workflows should materialize process outcomes into aggregate state rather than overlapping ownership
- renewal scheduling should continue to respect the subscription aggregate as the billing-anchor source of truth

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for lifecycle and renewal impact semantics of future cancellation outcomes

## 1. Core semantics

The `Cancellation & Retention` process may end in three terminal outcomes:

- `retained`
- `paused`
- `canceled`

These outcomes must not be treated as interchangeable.

Why:
- they have different business meaning
- they materialize differently on `Subscription`
- they have different consequences for `next_renewal_at` and future renewal execution

## 2. Semantics of `retained`

`retained` means the cancellation-handling process ended with the customer kept on the recurring path without pause as the final lifecycle effect.

### Process semantics

- `CancellationCase.status = retained`
- `CancellationCase.final_outcome = retained`

### Subscription semantics

- `Subscription.status` remains on the active recurring path
- the subscription does not move into `paused`
- the subscription does not move into `cancelled`
- `Subscription.cancel_effective_at` remains `null`

### Renewal semantics

- `Subscription.next_renewal_at` is preserved
- future renewals remain eligible under normal renewal rules
- an open or historical cancellation case does not by itself suppress future renewal execution

## 3. Semantics of `paused`

`paused` means the cancellation-handling process ended with pause as the chosen save outcome.

### Process semantics

- `CancellationCase.status = paused`
- `CancellationCase.final_outcome = paused`

### Why `paused` is both process outcome and lifecycle state

Final decision:
- `paused` is a retention outcome in `Cancellation & Retention`
- `paused` is also a real lifecycle state in `Subscriptions`

Recommended interpretation:
- the case determines that pause is the successful save outcome
- a workflow then materializes that decision into `Subscription.status = paused`

This split is preferred because:
- the process aggregate should own the cancellation journey and its outcome
- the subscription aggregate should own the final operational lifecycle state
- it keeps ownership boundaries consistent with the rest of the plugin

### Subscription semantics

When pause is applied:

- `Subscription.status = paused`
- `Subscription.paused_at` is set
- `Subscription.cancel_effective_at` remains `null`

### Renewal semantics

- `Subscription.next_renewal_at` should be preserved as the active billing anchor
- the subscription is not eligible for normal renewal execution while paused
- future renewal execution is blocked by lifecycle eligibility, not by moving billing-anchor ownership away from `Subscription`

This is consistent with the `Renewals` billing-anchor design:
- `Subscription.next_renewal_at` remains the source of truth for the next due period
- `paused` acts as an eligibility gate for execution

## 4. Semantics of `canceled`

`canceled` means the cancellation-handling process ended with final subscription cancellation.

### Process semantics

- `CancellationCase.status = canceled`
- `CancellationCase.final_outcome = canceled`

### Subscription semantics

When cancellation is materialized:

- `Subscription.status = cancelled`
- `Subscription.cancelled_at` is set
- `Subscription.cancel_effective_at` is set according to cancellation timing semantics

### Renewal semantics

- future renewal execution is no longer allowed after the cancellation effective point
- the subscription should no longer expose an active future billing anchor once cancellation is fully effective

## 5. `cancel_effective_at` semantics

`cancel_effective_at` is meaningful only for the cancellation path.

Final decision:
- it should not be set for `retained`
- it should not be set for `paused`
- it should be set only when the final outcome is `canceled`

### Process-level field

`CancellationCase.cancellation_effective_at` represents the agreed effective point of the cancellation outcome within the process.

This allows the case to express:
- immediate cancellation
- end-of-cycle cancellation

before or at the same time that the lifecycle effect is materialized.

### Subscription-level field

`Subscription.cancel_effective_at` represents the materialized lifecycle effect on the subscription aggregate.

Recommended interpretation:
- the case owns the process decision
- the subscription owns the final lifecycle timestamp

### Recommended timing rules

For MVP:

- immediate cancellation:
  - `cancel_effective_at = now`
- end-of-cycle cancellation:
  - `cancel_effective_at = Subscription.next_renewal_at` at the time the cancel decision is finalized

This is consistent with `Renewals` semantics where `cancel_effective_at` is the guard date for whether a due renewal should still execute.

## 6. `next_renewal_at` semantics

`Subscription.next_renewal_at` remains the billing-anchor source of truth.

`CancellationCase` must not take ownership of future scheduling.

### When the outcome is `retained`

- keep `Subscription.next_renewal_at`
- do not clear or recompute it solely because a cancellation case existed

Why:
- the customer remains on the active recurring path
- the billing anchor should stay stable

### When the outcome is `paused`

- keep `Subscription.next_renewal_at`
- do not clear the active due anchor

Why:
- pause blocks execution eligibility
- pause does not erase the subscription’s billing anchor ownership
- later resume behavior can continue from explicit subscription scheduling state

### When the outcome is `canceled`

Recommended rule:
- once cancellation becomes effective, `Subscription.next_renewal_at` should be cleared

Why this is preferred:
- a cancelled subscription should not present an active next billable cycle
- it simplifies Admin reads and future eligibility logic
- it matches the general Medusa-style subscription example where future order date is removed on cancellation

## 7. Future `RenewalCycle` semantics

`Cancellation & Retention` does not own `RenewalCycle`.

It influences renewal behavior indirectly by materializing lifecycle state on `Subscription`.

### If the outcome is `retained`

- existing and future renewal cycles continue under normal renewal rules
- no renewal cycle is canceled merely because a case existed

### If the outcome is `paused`

- future renewal cycles should not execute while the subscription remains paused
- the renewal module remains the owner of cycle execution state
- the pause effect is enforced through subscription lifecycle eligibility

### If the outcome is `canceled`

- any renewal cycle whose due point falls after `cancel_effective_at` must not execute
- renewal workflow or scheduler policy should respect the effective cancellation gate
- cancellation handling does not directly replace renewal-cycle state, but it does make future execution ineligible

## 8. Summary rules

- `retained` means the customer stays on the recurring path without pause or cancellation.
- `paused` means the customer is retained through temporary pause.
- `canceled` means the customer leaves the recurring lifecycle.
- `paused` is both:
  - a retention outcome of the cancellation process
  - a real lifecycle state of `Subscription`
- `cancel_effective_at` is set only on the `canceled` path.
- `next_renewal_at` is preserved for:
  - `retained`
  - `paused`
- `next_renewal_at` is cleared once cancellation becomes effective.
- future renewal execution:
  - continues normally for `retained`
  - is blocked by lifecycle eligibility for `paused`
  - is blocked after the effective point for `canceled`
