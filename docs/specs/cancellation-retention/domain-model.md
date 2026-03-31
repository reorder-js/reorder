# Reorder: Cancellation & Retention Domain Model Spec

This document covers steps `2.5.3` and `2.5.4` from `documentation/implementation_plan.md`.

Goal:
- define the domain contract for `CancellationCase`
- define the domain contract for `RetentionOfferEvent`
- decide which data belongs to regular model fields
- decide which data should remain outside the aggregate and move to future history records
- provide a stable foundation for workflows, Admin reads, and later retention-offer history

This specification builds on:
- `reorder/docs/specs/cancellation-retention/trigger-entry.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/subscriptions/domain-model.md`
- `reorder/docs/specs/dunning/domain-model.md`

The design follows Medusa patterns:
- a custom module should own one explicit operational aggregate
- fields used for filtering, sorting, and state transitions should be stored explicitly
- append-only history should be modeled separately from aggregate state when it has its own lifecycle
- JSON is appropriate for `metadata`, not for primary state-machine or reporting fields

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for the `CancellationCase` domain contract

## 1. Architectural assumptions

The `Cancellation & Retention` area has two conceptual levels:

- `CancellationCase`
- `RetentionOfferEvent`

`CancellationCase` is the primary operational record that will be persisted in the future cancellation module.

`RetentionOfferEvent` will be the child history record persisted separately from the case in a later step.

In practice:
- one case represents one operator-managed cancellation or save-flow journey for one subscription
- one case may have zero or more future retention-offer events
- one case aggregates the current process state and final process summary
- retention-offer events preserve append-only decision history

This split is intentional:
- the case is the process and decision aggregate
- the future event records are the audit trail of individual save actions and decisions

## 2. Responsibility boundaries

### `CancellationCase`

`CancellationCase` is responsible for:
- identifying the subscription entering cancellation handling
- storing the current lifecycle state of the cancellation-handling process
- storing churn reason and churn classification
- storing operator notes and recommendation state
- storing terminal outcome summary
- storing current convenience fields used by Admin and workflows

`CancellationCase` is not responsible for:
- the full lifecycle state of the subscription
- the full history of retention offers and decisions
- payment recovery state
- renewal-cycle execution state

### `RetentionOfferEvent`

`RetentionOfferEvent` is responsible for:
- storing one concrete retention offer proposal or save action record
- recording decision and application timestamps
- preserving per-offer audit history

`RetentionOfferEvent` is not responsible for:
- being the source of truth for case status
- replacing aggregate state stored in `CancellationCase`
- owning the final lifecycle status of the subscription

## 3. Why one aggregate and separate future history are preferred

The recommended domain structure uses:
- one primary entity now: `CancellationCase`
- one child history entity later: `RetentionOfferEvent`

Why this is preferred:
- process state and offer history are different concerns
- Admin list and Admin detail will need different read requirements
- multiple offers or save attempts should not overwrite one mutable field
- case-level filtering remains simple
- offer-level audit can stay append-only and explicit

Rejected alternative:
- store all retention-offer history only in `CancellationCase.metadata`

Why it is worse:
- harder to inspect operationally
- weaker auditability
- more difficult timeline rendering
- less aligned with the established `Renewals` and `Dunning` pattern

## 4. `CancellationCase` domain contract

Minimal domain contract:

- `id`
- `subscription_id`
- `status`
- `reason`
- `reason_category`
- `notes`
- `recommended_action`
- `final_outcome`
- `finalized_at`
- `finalized_by`
- `cancellation_effective_at`
- `metadata`

### Proposed logical shape

```ts
type CancellationCase = {
  id: string
  subscription_id: string
  status:
    | "requested"
    | "evaluating_retention"
    | "retention_offered"
    | "retained"
    | "paused"
    | "canceled"
    | "closed"
  reason: string | null
  reason_category:
    | "price"
    | "product_fit"
    | "delivery"
    | "billing"
    | "temporary_pause"
    | "switched_competitor"
    | "other"
    | null
  notes: string | null
  recommended_action:
    | "pause_offer"
    | "discount_offer"
    | "bonus_offer"
    | "direct_cancel"
    | null
  final_outcome:
    | "retained"
    | "paused"
    | "canceled"
    | "abandoned"
    | null
  finalized_at: string | null
  finalized_by: string | null
  cancellation_effective_at: string | null
  metadata: Record<string, unknown> | null
}
```

## 5. Regular `CancellationCase` fields

The following fields should be regular model columns:

- `id`
- `subscription_id`
- `status`
- `reason`
- `reason_category`
- `notes`
- `recommended_action`
- `final_outcome`
- `finalized_at`
- `finalized_by`
- `cancellation_effective_at`

Why:
- they are needed for Admin filtering and sorting
- they are needed for operational state transitions
- they are needed for finalization and audit summary
- they express explicit process state rather than flexible configuration

## 6. Why `subscription_id` should be a scalar field

The model should store:

- `subscription_id`

as an explicit scalar field.

Why:
- it simplifies filtering and indexing
- it simplifies Admin and workflow queries
- it preserves the same practical Medusa pattern already used in `Subscriptions`, `Renewals`, and `Dunning`
- module links can still be added later without losing efficient source-record access

## 7. `status`

`status` is the case-level state machine field.

It answers:
- what is the current operational state of the cancellation-handling process

It should be a scalar enum field, not JSON.

Why:
- case status will drive workflow eligibility
- case status will drive Admin actions
- case status is a primary filtering and sorting field

The exact transition rules belong to a later step, but the domain contract should reserve these values:

- `requested`
- `evaluating_retention`
- `retention_offered`
- `retained`
- `paused`
- `canceled`
- `closed`

## 8. `reason`

`reason` is the case-level business reason entered or selected for this cancellation journey.

It should be a regular nullable text field.

Why:
- the process may start before the operator records the reason
- the field is still part of the core business contract and should not be pushed into metadata
- Admin detail, filtering, reporting exports, and audit views may need direct access to it later

Important note:
- `reason` is not the normalized reporting category
- that belongs to `reason_category`

## 9. `reason_category`

`reason_category` is the normalized classification of the churn reason.

It should be a scalar enum field, not JSON.

Why:
- Admin list and analytics will need structured filtering
- the normalized category should not be inferred from free-form text later
- this field belongs to the process contract, not to flexible metadata

Recommended initial values:
- `price`
- `product_fit`
- `delivery`
- `billing`
- `temporary_pause`
- `switched_competitor`
- `other`

The taxonomy may evolve in a later dedicated step, but the domain contract should already treat this as a first-class structured field.

## 10. `notes`

`notes` stores free-form operator context for the case.

It should be a regular nullable text field.

Why:
- this is process-owned business context
- it may need direct display in detail views
- it should not be hidden inside metadata if operators are expected to review it

## 11. `recommended_action`

`recommended_action` is the current recommendation state for the case.

It should describe what the process recommends next, not what has already been applied.

It should be a scalar enum field, not JSON.

Recommended values:
- `pause_offer`
- `discount_offer`
- `bonus_offer`
- `direct_cancel`

Why:
- recommendation is part of the aggregate’s current decision state
- workflows and Admin UI may need to branch on it
- it is not flexible technical metadata

Important note:
- actual offer history and applied actions should live later in `RetentionOfferEvent`
- `recommended_action` is not a replacement for that history

## 12. `final_outcome`

`final_outcome` is the terminal business summary of the case.

It is separate from `status`.

`status` answers:
- where the process is now

`final_outcome` answers:
- how the process ultimately ended

It should be a scalar enum field, not JSON.

Recommended values:
- `retained`
- `paused`
- `canceled`
- `abandoned`

Why:
- reporting and Admin review need a direct terminal outcome field
- current process state and final business result should not be collapsed into one field
- this matches the general pattern of keeping aggregate state and final summary distinct

## 13. `finalized_at` and `finalized_by`

These are case-level finalization audit fields.

They should be regular scalar columns.

Why:
- they belong to the aggregate’s terminal summary
- Admin detail and later filtering may need them directly
- they should not be buried inside metadata if they are part of the core process contract

## 14. `cancellation_effective_at`

`cancellation_effective_at` is the process-level effective time chosen for final cancellation outcome.

It should be a regular nullable date-time field.

Why:
- it is a first-class business decision of the cancellation process
- it may be needed in case detail and workflow logic
- it should remain explicit and queryable

Important note:
- this field represents the case-level decision point
- it does not replace `Subscription.cancel_effective_at`
- later workflows may materialize this value into the subscription’s lifecycle state when final cancellation is applied

## 15. `metadata`

`metadata` remains a standard JSON field.

Why:
- this follows the Medusa pattern for extra non-core data
- it can store supplementary audit or technical context
- it should not store fields needed for primary filtering, sorting, or state transitions

## 16. `RetentionOfferEvent` domain contract

Minimal domain contract:

- `id`
- `cancellation_case_id`
- `offer_type`
- `offer_payload`
- `decision_status`
- `decision_reason`
- `decided_at`
- `decided_by`
- `applied_at`
- `metadata`

### Proposed logical shape

```ts
type RetentionOfferEvent = {
  id: string
  cancellation_case_id: string
  offer_type: "pause_offer" | "discount_offer" | "bonus_offer"
  offer_payload: {
    pause_offer?: {
      pause_cycles: number | null
      resume_at: string | null
      note: string | null
    }
    discount_offer?: {
      discount_type: "percentage" | "fixed"
      discount_value: number
      duration_cycles: number | null
      note: string | null
    }
    bonus_offer?: {
      bonus_type: "free_cycle" | "gift" | "credit"
      value: number | null
      label: string | null
      duration_cycles: number | null
      note: string | null
    }
  } | null
  decision_status: "proposed" | "accepted" | "rejected" | "applied" | "expired"
  decision_reason: string | null
  decided_at: string | null
  decided_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
}
```

## 17. Regular `RetentionOfferEvent` fields

The following fields should be regular model columns:

- `id`
- `cancellation_case_id`
- `offer_type`
- `decision_status`
- `decision_reason`
- `decided_at`
- `decided_by`
- `applied_at`

Why:
- they are needed for timeline reads and audit history
- they are needed for Admin detail rendering and later filtering
- they express explicit event state rather than flexible configuration

## 18. Why `cancellation_case_id` should be a scalar field

The model should store:

- `cancellation_case_id`

as an explicit scalar field.

Why:
- it simplifies filtering and indexing
- it simplifies timeline queries for one case
- it preserves the same practical pattern already used by `RenewalAttempt` and `DunningAttempt`
- later same-module relations can still be defined without losing efficient source-record access

## 19. `offer_type`

`offer_type` identifies what kind of save action this event represents.

It should be a scalar enum field, not JSON.

Recommended values:
- `pause_offer`
- `discount_offer`
- `bonus_offer`

Why:
- the event timeline and Admin detail need a direct type discriminator
- the payload shape depends on the offer type
- reporting and filtering should not infer the type from JSON structure

Important note:
- `direct_cancel` should not be part of `RetentionOfferEvent`
- direct cancellation is a case-level process path, not a retention offer

## 20. `offer_payload`

`offer_payload` is the structured snapshot of the concrete offer proposed in this event.

It should be stored as JSON.

Why:
- the payload shape varies by `offer_type`
- the field represents one structured business object
- splitting it into many nullable scalar columns would make the model harder to evolve and harder to reason about

Important note:
- this payload is a snapshot of the proposed offer at the time of the event
- it should not be reconstructed later from current recommendation state or current business rules

## 21. `decision_status`

`decision_status` is the event-level decision state for one concrete offer proposal.

It should be a scalar enum field, not JSON.

Recommended values:
- `proposed`
- `accepted`
- `rejected`
- `applied`
- `expired`

Why:
- the event needs its own lifecycle separate from the case aggregate
- Admin detail will later show a timeline of proposals and their outcomes
- this field should remain directly queryable and auditable

Important note:
- `decision_status` is not the same as `CancellationCase.status`
- it describes one offer event, not the whole cancellation journey

## 22. `decision_reason`

`decision_reason` stores the reason behind the outcome of this concrete event.

It should be a regular nullable text field.

Why:
- the operator may need to explain why one offer was accepted, rejected, or allowed to expire
- the field belongs to the event contract, not to flexible metadata

Important note:
- `decision_reason` is not the same as the churn `reason` on `CancellationCase`
- `CancellationCase.reason` explains why the subscription entered cancellation handling
- `decision_reason` explains why a specific offer event ended the way it did

## 23. `decided_at`, `decided_by`, and `applied_at`

These are event-level audit and materialization fields.

They should be regular scalar columns.

Why:
- a decision and an application may happen at different times
- Admin detail and audit history should be able to show both moments directly
- these timestamps are first-class process fields, not metadata

### `decided_at`

Represents:
- when the event moved from proposal to a decision state such as accepted or rejected

### `decided_by`

Represents:
- who made the decision on the offer event

### `applied_at`

Represents:
- when the accepted offer was actually materialized into a business effect

This is intentionally separate from `decided_at`.

## 24. `metadata`

`metadata` remains a standard JSON field.

Why:
- this follows the Medusa pattern for extra non-core data
- it can store supplementary technical or audit context
- it should not store fields needed for primary filtering, sorting, or event-state transitions

## 25. What should stay outside `RetentionOfferEvent`

The following data should not be stored as core mutable fields on `RetentionOfferEvent`:

- the aggregate `CancellationCase.status`
- the aggregate `CancellationCase.final_outcome`
- the lifecycle state of the subscription
- dunning retry state
- renewal execution state

Why:
- these belong to other aggregates
- duplicating them would weaken source-of-truth boundaries already defined in `2.5.2`

## 26. What should stay outside `CancellationCase`

The following data should not be stored as core mutable fields on `CancellationCase`:

- append-only retention-offer history
- full decision timeline for every offer
- current lifecycle status of the subscription as a duplicated field
- dunning retry state
- renewal execution state

Why:
- these belong to other aggregates or to the future `RetentionOfferEvent`
- duplicating them would weaken source-of-truth boundaries already defined in `2.5.2`

## 27. Query implications

### Direct fields should support:

- Admin list filtering by `status`
- Admin list filtering by `reason_category`
- Admin list filtering by `final_outcome`
- sorting by creation and finalization timestamps
- case-level lookup by `subscription_id`
- event timeline lookup by `cancellation_case_id`
- event-level ordering by `decided_at` and `applied_at` later in detail views

### `metadata` should not be relied on for:

- primary Admin filters
- current state transitions
- reporting-critical fields

This keeps the future read model aligned with the same principles already used in `Subscriptions`, `Renewals`, and `Dunning`.
