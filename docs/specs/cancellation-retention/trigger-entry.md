# Reorder: Cancellation & Retention Trigger Entry Spec

This document covers step `2.5.1` from `documentation/implementation_plan.md`.

Goal:
- define when a subscription should enter `Cancellation & Retention`
- define whether the flow starts only from an Admin action or also from domain triggers
- define whether every cancellation intent creates a `CancellationCase`
- define whether direct final cancellation may bypass the case flow

This specification builds on:
- `reorder/docs/specs/subscriptions/domain-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/architecture/subscriptions.md`
- `reorder/docs/architecture/dunning.md`

The direction follows Medusa patterns:
- multi-step operational processes should use explicit domain records rather than implicit UI-only state
- workflows remain the mutation boundary, while modules own process state
- Admin-facing operational areas should use explicit process entry semantics
- destructive outcomes such as final cancellation should remain auditable and workflow-backed

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for the trigger boundary of the future area

## 1. Trigger definition

`Cancellation & Retention` starts only when an Admin user explicitly begins a cancellation process for a subscription.

In practical terms:
- the trigger is a manual Admin action
- the action represents a conscious cancellation intent
- the flow starts before a final cancellation is applied to the subscription

`Cancellation & Retention` does not start automatically from system-side domain events in MVP.

## 2. Responsibility boundary

The four areas keep separate responsibilities:

- `Subscriptions` own the subscription lifecycle state and operational subscription data
- `Renewals` own renewal-cycle execution and approval state
- `Dunning` owns recovery of failed renewal payments
- `Cancellation & Retention` owns the offboarding and save-flow process once an operator initiates cancellation handling

This means:
- not every lifecycle change enters `Cancellation & Retention`
- `Cancellation & Retention` is not a generic event bucket for subscription problems
- the source event for `Cancellation & Retention` is an explicit Admin cancellation intent

## 3. Manual Admin entry only

For MVP, `Cancellation & Retention` should be entered only by a manual Admin action.

Recommended trigger sources:
- cancellation action from the subscription list
- cancellation action from the subscription detail page
- any future dedicated Admin entrypoint explicitly labeled as starting cancellation handling

Not valid as automatic triggers in MVP:
- renewal failure by itself
- open or terminal `DunningCase`
- scheduler decisions
- webhooks
- customer inactivity heuristics
- churn scoring or recommendation jobs

Reasoning:
- the feature is designed as an operator workflow, not an automatic lifecycle engine
- the process needs deliberate human input such as `reason`, notes, recommendation review, and outcome selection
- automatic entry would mix recovery, churn analytics, and lifecycle enforcement before the domain rules are fully defined

## 4. Every cancellation intent must go through a case

Every explicit intent to cancel a subscription should create or reuse a `CancellationCase`.

Final decision:
- each cancellation intent enters the case flow
- the system creates a new active `CancellationCase` when none exists
- if an active case already exists for the subscription, the operator should continue that case instead of opening another one

This means:
- `CancellationCase` is the required process record for cancellation handling
- the case is not optional metadata around cancellation
- the case is the durable record that captures the operator journey

## 5. Direct cancellation must not bypass the case

Final cancellation without retention still must go through `CancellationCase`.

This means:
- there is no separate direct-cancel flow outside the case process in the target `Cancellation & Retention` design
- even when the operator knows they want to cancel immediately, the process still opens or uses a case first
- final cancellation becomes an outcome of the case, not a parallel path

Reasoning:
- the product goal requires tracking:
  - cancellation reasons
  - retention recommendations
  - accepted or rejected save actions
  - final churn outcomes
- bypassing the case would create analytics and audit gaps
- a consistent process entry keeps Admin UX predictable and aligned with other operational case flows in the plugin

## 6. Why case-based entry is preferred

`Cancellation & Retention` is not just a status mutation on `Subscription`.

It is a multi-step operational workflow that may include:
- recording churn reason
- deciding whether to offer pause
- deciding whether to offer discount or bonus retention
- applying a save action
- finalizing cancellation if retention does not succeed

This is closer to the role played by `DunningCase` than to the direct lifecycle mutations in `Subscriptions`.

Why a dedicated case is preferred:
- the process has its own history and outcome separate from raw subscription status
- the process needs one durable source of truth for retention decisions
- Admin needs auditable `who / when / why` style handling later in the flow
- churn analytics should be based on explicit offboarding cases, not inferred only from `Subscription.status = cancelled`

## 7. Allowed subscription entry states

At the trigger stage, the flow should only start for subscriptions that are still operationally capable of entering cancellation handling.

Recommended eligible states:
- `active`
- `paused`
- `past_due`

Not eligible:
- `cancelled`

Reasoning:
- `active` and `paused` are normal operator-managed cancellation candidates
- `past_due` may still require an operator-managed offboarding decision and should not be excluded by default
- `cancelled` already represents a terminal lifecycle outcome and should not open a new cancellation case

## 8. Relationship to other areas

### 8.1 `Subscriptions`

`Subscriptions` continue to own:
- lifecycle state on the subscription record
- fields such as `cancelled_at` and `cancel_effective_at`

`Cancellation & Retention` owns:
- the process that leads to `paused`, `retained`, or `canceled` outcome
- reason capture and retention decision history

This means:
- `Subscription` remains the source of truth for the final lifecycle status
- `CancellationCase` becomes the source of truth for the cancellation-handling process

### 8.2 `Renewals`

`Renewals` do not automatically open `CancellationCase` in MVP.

Even if renewal behavior later influences operator recommendations:
- a failed or blocked renewal is not itself a cancellation trigger
- the operator must still explicitly start cancellation handling

### 8.3 `Dunning`

`Dunning` does not automatically open `CancellationCase` in MVP.

Even if a subscription is `past_due` or has an active dunning process:
- that does not itself create a cancellation case
- the operator must still explicitly enter cancellation handling

This keeps:
- payment recovery
- renewal execution
- churn handling

as separate operational flows with separate case semantics.

## 9. Trigger timing

`Cancellation & Retention` should start before any final cancellation mutation is applied to the subscription.

In MVP semantics:
- the operator expresses cancellation intent
- the system creates or reuses a `CancellationCase`
- the case becomes the process record for the remaining flow
- a later workflow may apply retention or finalize cancellation

This preserves clean boundaries:
- the case exists before the terminal subscription outcome
- the cancellation process remains auditable end-to-end
- final cancellation becomes one possible outcome of the case rather than the entry trigger itself

## 10. Summary decision

The trigger boundary for MVP is:

- `Cancellation & Retention` starts only from explicit Admin intent
- it does not start from automatic domain triggers
- every cancellation intent creates or reuses a `CancellationCase`
- final cancellation without retention still goes through the case

This gives the future area a clear operational shape:
- one deliberate entrypoint
- one durable process record
- one place to capture `reason`, retention decisions, and final churn outcome
