# Reorder: Cancellation & Retention Module Impact Semantics Spec

This document covers step `2.5.9` from `documentation/implementation_plan.md`.

Goal:
- define how `Cancellation & Retention` affects existing modules
- decide what happens to scheduled `RenewalCycle` records
- decide how an active `DunningCase` coexists with cancellation handling
- decide whether `past_due` subscriptions may enter retention
- decide whether `paused` and `cancelled` subscriptions may open a new cancellation case

This specification builds on:
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`
- `reorder/docs/specs/renewals/state-machine.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/state-machine.md`
- `reorder/docs/specs/cancellation-retention/trigger-entry.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/lifecycle-semantics.md`

The direction follows Medusa patterns:
- modules keep isolated ownership of their aggregate state
- cross-domain coordination happens through workflows and explicit lifecycle effects
- one process aggregate should not directly own another process aggregate’s state machine
- execution records should remain owned by the module that created them

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for the impact of future cancellation handling on `Subscriptions`, `Renewals`, and `Dunning`

## 1. Core integration decision

`Cancellation & Retention` may affect other domains, but it must not replace their ownership boundaries.

This means:
- `Renewals` remain the owner of `RenewalCycle`
- `Dunning` remains the owner of `DunningCase`
- `Subscriptions` remain the owner of lifecycle state and scheduling anchors
- `Cancellation & Retention` coordinates with those areas through workflows and lifecycle materialization, not by taking over their primary state

## 2. Effect on scheduled `RenewalCycle`

### Final decision

Scheduled `RenewalCycle` records are not deleted, re-owned, or directly mutated just because a `CancellationCase` was opened.

`Cancellation & Retention` affects future renewals indirectly through final lifecycle effects on `Subscription`.

### If the cancellation outcome is `retained`

- scheduled renewal cycles remain intact
- future renewal execution continues according to normal subscription eligibility rules

### If the cancellation outcome is `paused`

- scheduled renewal cycles remain intact as domain records
- future renewal execution is blocked while `Subscription.status = paused`
- the blocked state comes from subscription eligibility, not from transferring ownership away from `Renewals`

### If the cancellation outcome is `canceled`

- renewal cycles whose effective due point falls after `cancel_effective_at` must not execute
- those cycles remain owned by `Renewals`
- later workflow or scheduler rules may mark them as skipped or otherwise non-executable, but they are not re-owned by `Cancellation & Retention`

### Why this is preferred

- `RenewalCycle` is the execution aggregate for one billing unit
- module ownership stays explicit
- future eligibility is easier to reason about when driven by subscription lifecycle state

## 3. Effect on active `DunningCase`

### Final decision

An active `DunningCase` may coexist with an active `CancellationCase`.

Opening cancellation handling does not automatically:
- close the dunning case
- change the dunning status
- transfer recovery ownership to the cancellation module

### Coexistence rule

- `Dunning` remains the owner of payment-recovery state
- `Cancellation & Retention` remains the owner of churn and offboarding process state
- both processes may be active for the same subscription at the same time in MVP

### Operator-read implications

The Admin read model for cancellation should expose that an active dunning context exists.

Why:
- the operator must understand when a subscription is both:
  - under payment recovery
  - under churn/cancellation handling

### Outcome implications

If the cancellation outcome is:

- `retained`:
  - `DunningCase` continues under its own rules if payment recovery is still needed
- `paused`:
  - pause does not automatically close dunning
  - later workflow policy may decide whether retry remains appropriate, but ownership still stays in `Dunning`
- `canceled`:
  - cancellation does not automatically rewrite `DunningCase`
  - any later coordination, such as explicit closure or manual-resolution behavior, should happen through dedicated workflow rules rather than implicit ownership overlap

## 4. Whether a `past_due` subscription may enter retention

### Final decision

Yes. A `past_due` subscription may enter `Cancellation & Retention`.

### Reasoning

- `past_due` is not a terminal lifecycle state
- operator-managed churn handling may still be needed for a `past_due` subscription
- the presence of payment recovery does not remove the need for:
  - retention evaluation
  - pause offers
  - final cancellation handling

### Operational consequence

- `past_due` is a valid entry state for opening a `CancellationCase`
- Admin reads should expose any active dunning context alongside the cancellation case

## 5. Whether a `paused` subscription may open a new case

### Final decision

Yes. A `paused` subscription may open a `CancellationCase`.

### Reasoning

- `paused` is not a terminal lifecycle outcome for the whole customer relationship
- an operator may still need to:
  - finalize cancellation
  - reassess churn handling
  - document a final offboarding outcome

### Guard

The existing uniqueness rule still applies:
- one subscription may have only one active `CancellationCase` at a time

## 6. Whether a `cancelled` subscription may open a new case

### Final decision

No. A `cancelled` subscription must not open a new `CancellationCase`.

### Reasoning

- `cancelled` is already a terminal lifecycle state
- the cancellation process should lead to cancellation, not start after cancellation already happened
- allowing new cases on cancelled subscriptions would weaken churn semantics and analytics consistency

Historical analysis should rely on the existing historical case, not on creating a new one.

## 7. Summary rules

- `RenewalCycle` remains owned by `Renewals`.
- `DunningCase` remains owned by `Dunning`.
- `Cancellation & Retention` coordinates by materializing lifecycle effects on `Subscription`.
- Opening a cancellation case does not delete or re-own scheduled renewal cycles.
- Active dunning and active cancellation may coexist.
- `past_due` subscriptions may enter retention.
- `paused` subscriptions may enter retention.
- `cancelled` subscriptions may not open a new cancellation case.
