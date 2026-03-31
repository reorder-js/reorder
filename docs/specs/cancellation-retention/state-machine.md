# Reorder: Cancellation & Retention State Machine Spec

This document covers step `2.5.7` from `documentation/implementation_plan.md`.

Goal:
- define the business status model for `CancellationCase`
- define the event status model for `RetentionOfferEvent`
- define legal and illegal state transitions
- define when retention actions may still be proposed
- define when the case is considered terminal

This specification builds on:
- `reorder/docs/specs/cancellation-retention/domain-model.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/trigger-entry.md`

The direction follows Medusa patterns:
- operational aggregate state should stay explicit and queryable
- event-history state should remain separate from aggregate state
- terminal business outcomes should be modeled clearly on the aggregate
- manual Admin actions should reuse the same domain rules rather than inventing parallel semantics

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for status and transition semantics of the future area

## 1. State model overview

The `Cancellation & Retention` area uses two separate state dimensions:

- `CancellationCase.status`
- `RetentionOfferEvent.decision_status`

These dimensions must not be collapsed into one field.

Why:
- case status answers where the whole cancellation-handling process currently is
- event status answers what happened to one concrete retention offer
- aggregate state and offer history must stay separated for clean Admin reads and workflow rules

## 2. `CancellationCase.status`

`CancellationCase.status` is the aggregate process status of one operator-managed cancellation journey.

### Allowed values

- `requested`
- `evaluating_retention`
- `retention_offered`
- `retained`
- `paused`
- `canceled`

### Meaning of each value

#### `requested`

The case exists, but the operator has not yet progressed into active retention evaluation or final outcome.

This is the entry state.

Typical examples:
- the operator started cancellation handling from the subscription list
- the case was created from the detail page and is waiting for structured review

#### `evaluating_retention`

The case is active and being evaluated for save actions or offboarding direction.

This means:
- the case is not terminal
- the operator may still choose retention or direct cancellation
- recommendation logic may still change

#### `retention_offered`

The case is active and at least one concrete retention offer has been proposed.

This means:
- the process remains open
- the case has entered an offer-driven branch
- the outcome is not yet final

#### `retained`

The case has closed successfully with the customer retained without pause as the final path.

This means:
- the cancellation process is terminal
- the customer relationship remains active in the retained sense
- no further retention actions should be proposed in this case

#### `paused`

The case has closed successfully with pause as the final retention outcome.

This means:
- the cancellation process is terminal
- the subscription is expected to materialize into paused lifecycle state
- no further retention actions should be proposed in this case

#### `canceled`

The case has closed with final cancellation.

This means:
- the cancellation process is terminal
- the subscription is expected to materialize into cancelled lifecycle state
- no further retention actions should be proposed in this case

## 3. Why there is no `closed`

### Final decision

`CancellationCase` should not use a separate `closed` status in MVP.

Why this is preferred:
- `retained`, `paused`, and `canceled` already express terminal business outcomes directly
- a generic `closed` status would force the system to reconstruct the real business result from other fields
- the current plugin style favors explicit, queryable status values with direct operational meaning

Recommended interpretation:
- `retained`, `paused`, and `canceled` are the terminal statuses
- `final_outcome` remains a terminal summary field, but it does not need a generic wrapper status like `closed`

## 4. `RetentionOfferEvent.decision_status`

`RetentionOfferEvent.decision_status` is the decision state of one concrete retention offer proposal.

### Allowed values

- `proposed`
- `accepted`
- `rejected`
- `applied`
- `expired`

### Meaning of each value

#### `proposed`

The offer has been created and is waiting for a decision.

This means:
- the offer exists in the case timeline
- no final decision has yet been recorded on that offer

#### `accepted`

The offer was accepted, but has not necessarily been applied yet.

This means:
- operator or customer-side acceptance occurred
- business materialization may still be pending

#### `rejected`

The offer was explicitly rejected.

This means:
- the event is terminal
- the same offer event should not re-enter the active flow

#### `applied`

The offer was actually materialized into a business effect.

This means:
- the event is terminal
- `applied_at` should be present
- the offer is no longer only a proposal

#### `expired`

The offer is no longer valid or relevant without being applied.

This means:
- the event is terminal
- the offer may have timed out or been superseded by later process decisions

## 5. Why `applied` is a separate status

### Final decision

`applied` should remain an explicit event status, not only a derived meaning of `applied_at != null`.

Why this is preferred:
- Admin detail and audit views benefit from a directly queryable event outcome
- acceptance and application are not always the same moment
- the event state should not require deriving semantic status from a timestamp field

Recommended interpretation:
- `accepted` means the decision is positive
- `applied` means the business effect was actually executed

## 6. Legal `CancellationCase.status` transitions

Recommended legal transitions:

- `requested -> evaluating_retention`
- `requested -> canceled`
- `evaluating_retention -> retention_offered`
- `evaluating_retention -> retained`
- `evaluating_retention -> paused`
- `evaluating_retention -> canceled`
- `retention_offered -> evaluating_retention`
- `retention_offered -> retained`
- `retention_offered -> paused`
- `retention_offered -> canceled`

### `requested -> evaluating_retention`

Allowed when:
- the operator enters structured evaluation of save actions
- the case remains active and not yet terminal

### `requested -> canceled`

Allowed when:
- the operator intentionally skips retention handling and finalizes cancellation
- the cancellation flow still goes through the case

### `evaluating_retention -> retention_offered`

Allowed when:
- a concrete retention offer is proposed and recorded
- the case now moves from evaluation into offer-driven handling

### `evaluating_retention -> retained`

Allowed when:
- the process resolves successfully without needing to keep the case open for further offers
- the business result is retention without pause

### `evaluating_retention -> paused`

Allowed when:
- the process resolves successfully with pause as the chosen retention outcome

### `evaluating_retention -> canceled`

Allowed when:
- the operator or workflow determines the case should end in final cancellation

### `retention_offered -> evaluating_retention`

Allowed when:
- the currently proposed offer was rejected or expired
- the case returns to a general evaluation state for deciding the next step

### `retention_offered -> retained`

Allowed when:
- a concrete retention offer succeeds and the final business result is retained

### `retention_offered -> paused`

Allowed when:
- a pause offer or equivalent save path succeeds and pause becomes the final business result

### `retention_offered -> canceled`

Allowed when:
- proposed retention actions did not resolve the case
- the operator finalizes cancellation instead

## 7. Illegal `CancellationCase.status` transitions

The following transitions should be treated as invalid:

- `requested -> retained`
- `requested -> paused`
- `retention_offered -> requested`
- `retained -> evaluating_retention`
- `retained -> retention_offered`
- `retained -> canceled`
- `paused -> evaluating_retention`
- `paused -> retention_offered`
- `paused -> canceled`
- `canceled -> evaluating_retention`
- `canceled -> retention_offered`
- `canceled -> retained`

Why:
- terminal statuses must remain terminal
- the case should not move backward to a less-informed entry state
- a final business result should not be mutated into a conflicting new result in the same case

## 8. Legal `RetentionOfferEvent.decision_status` transitions

Recommended legal transitions:

- `proposed -> accepted`
- `proposed -> rejected`
- `proposed -> expired`
- `accepted -> applied`
- `accepted -> expired`

### `proposed -> accepted`

Allowed when:
- the offer was positively accepted by the operator or customer-facing decision flow

### `proposed -> rejected`

Allowed when:
- the offer was explicitly declined

### `proposed -> expired`

Allowed when:
- the offer stopped being relevant without being accepted or applied
- the process moved on and this event should close without success

### `accepted -> applied`

Allowed when:
- the accepted offer is actually materialized through workflow-backed business logic

### `accepted -> expired`

Allowed when:
- an accepted offer can no longer be applied and becomes invalid before materialization

## 9. Illegal `RetentionOfferEvent.decision_status` transitions

The following transitions should be treated as invalid:

- `proposed -> applied`
- `rejected -> *`
- `expired -> *`
- `applied -> *`

Why:
- application should follow an explicit accepted state
- terminal event outcomes should remain terminal
- event history should stay append-only and semantically clean

## 10. When retention actions may still be proposed

New retention actions may only be proposed while the case is active.

Recommended active statuses:
- `requested`
- `evaluating_retention`
- `retention_offered`

Practical rule:
- in `requested`, the process may enter evaluation and propose the first save path
- in `evaluating_retention`, the process may propose a new concrete retention action
- in `retention_offered`, the process may propose a later offer only after the currently relevant offer path has been resolved or the case has moved back into evaluation logic

## 11. When retention actions must no longer be proposed

No new retention actions should be proposed when the case status is:

- `retained`
- `paused`
- `canceled`

Why:
- these are terminal business outcomes
- the case is no longer an active decision process
- any further save action would belong to a new future case, not the closed one

## 12. Terminal-case semantics

`CancellationCase` is terminal when its status is:

- `retained`
- `paused`
- `canceled`

Terminal means:
- no new retention offers
- no return to active process states
- no further mutation of business outcome inside the same case

The case remains readable for:
- Admin detail
- audits
- churn analytics

## 13. Relationship between event state and case state

`RetentionOfferEvent.decision_status` does not automatically dictate `CancellationCase.status`.

Why:
- one case may have multiple offer events over time
- a rejected or expired offer does not by itself close the case
- the aggregate outcome should only change when the workflow decides the case has reached a final business result

Recommended interpretation:
- event state informs workflow decisions
- case state remains the source of truth for the whole process

## 14. Summary decision

The `Cancellation & Retention` state machine for MVP is:

- `CancellationCase.status`:
  - `requested`
  - `evaluating_retention`
  - `retention_offered`
  - `retained`
  - `paused`
  - `canceled`
- `RetentionOfferEvent.decision_status`:
  - `proposed`
  - `accepted`
  - `rejected`
  - `applied`
  - `expired`

With these rules:
- `retained`, `paused`, and `canceled` are terminal case states
- `proposed`, `accepted`, `rejected`, `applied`, and `expired` are event-level states
- new retention actions are only allowed while the case is active
- terminal case states do not allow new offers or a return to active flow
