# Reorder: Cancellation & Retention Analytics and KPI Spec

This document covers step `2.5.13` from `documentation/implementation_plan.md`.

Goal:
- define the churn analytics contract for `Cancellation & Retention`
- define how top reasons should be reported
- define how retention-offer acceptance should be measured
- define how retention rate versus cancel rate should be measured
- decide whether KPIs are sourced from `CancellationCase`, `RetentionOfferEvent`, or final subscription status

This specification builds on:
- `reorder/docs/specs/cancellation-retention/domain-model.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/lifecycle-semantics.md`
- `reorder/docs/specs/cancellation-retention/query-read-model.md`

The direction follows Medusa patterns:
- reporting should use explicit structured fields owned by the relevant aggregate
- event-level metrics should use append-only event history rather than inferred aggregate guesses
- lifecycle status from other modules should not replace process analytics owned by the custom module
- analytics should remain aligned with domain ownership and Admin operability

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for churn analytics and KPI semantics of the future cancellation module

## 1. Core reporting decision

The primary analytics sources should be:
- `CancellationCase` for process-level and outcome-level KPIs
- `RetentionOfferEvent` for offer-level KPIs

Final subscription lifecycle status should not be the primary source of churn analytics.

Why:
- `Subscription` does not own the cancellation process
- `Subscription.status` does not explain why a cancellation happened
- `Subscription.status` does not preserve the retention journey or offer history
- the cancellation feature’s analytics should remain rooted in the process aggregate and its event history

## 2. Source of truth by KPI type

### `CancellationCase`

`CancellationCase` should be the source of truth for:
- top reason categories
- case volume
- terminal case volume
- retention rate
- cancel rate
- pause rate
- outcome trends over time

Why:
- the case owns:
  - `reason_category`
  - `reason`
  - `status`
  - `final_outcome`
  - `created_at`
  - `finalized_at`

These fields are the explicit process reporting contract.

### `RetentionOfferEvent`

`RetentionOfferEvent` should be the source of truth for:
- offer acceptance rate
- offer rejection rate
- offer applied rate
- acceptance rate by offer type
- offer volume by type
- offer trends over time

Why:
- one event represents one concrete offer proposal and decision
- event-level KPIs should be based on append-only history, not inferred from aggregate summary

### `Subscription`

`Subscription` should not be the primary source of churn KPIs.

It may be used only as:
- a lifecycle validation signal
- a secondary consistency check
- a supporting context for broader recurring-business reporting outside this feature

## 3. Top reasons

### Final decision

Top reasons should be reported primarily from `CancellationCase.reason_category`.

`CancellationCase.reason` should be treated as qualitative drill-down context, not the primary aggregation key.

### Recommended KPI

Primary aggregation:
- count of cases grouped by `reason_category`

Recommended default interpretation:
- report top reasons from all cases entering cancellation handling

Optional refinement:
- allow filtering to terminal cases only when a report wants to show only finalized churn-handling outcomes

### Role of free-text `reason`

`reason` should support:
- detail review
- exports
- operator audit
- qualitative investigation

It should not be treated as the main structured reporting key.

## 4. Acceptance rate of retention offers

### Final decision

Acceptance rate should be reported from `RetentionOfferEvent`.

### Recommended definition

Numerator:
- number of offer events with `decision_status IN ('accepted', 'applied')`

Denominator:
- number of all offer events that were proposed in the process timeline

Recommended practical interpretation in MVP:
- all `RetentionOfferEvent` rows belong to the denominator

### Why `applied` belongs to accepted outcomes

`applied` is a stronger form of accepted outcome.

So:
- accepted means positive decision recorded
- applied means positive decision was materialized

Both should count toward acceptance rate.

### Breakdown requirement

Acceptance should also be reportable by:
- `pause_offer`
- `discount_offer`
- `bonus_offer`

This is necessary for evaluating which retention tactics perform best.

## 5. Retention rate versus cancel rate

### Final decision

Retention rate and cancel rate should be reported from terminal outcomes on `CancellationCase`.

### Terminal population

The denominator should be terminally resolved cases:
- `final_outcome = retained`
- `final_outcome = paused`
- `final_outcome = canceled`

### Retention rate

Numerator:
- cases with `final_outcome IN ('retained', 'paused')`

Denominator:
- cases with `final_outcome IN ('retained', 'paused', 'canceled')`

Why `paused` counts as retention:
- pause was previously defined as a retention outcome of the cancellation process
- even though it materializes to lifecycle `Subscription.status = paused`, it still means churn was prevented at the process level

### Cancel rate

Numerator:
- cases with `final_outcome = 'canceled'`

Denominator:
- cases with `final_outcome IN ('retained', 'paused', 'canceled')`

## 6. Pause rate

`pause_rate` should be supported as a separate KPI derived from `CancellationCase`.

### Recommended definition

Numerator:
- cases with `final_outcome = 'paused'`

Denominator:
- cases with `final_outcome IN ('retained', 'paused', 'canceled')`

Why:
- pause is a distinct save outcome and should not disappear inside a generic retention total

## 7. Trend semantics

Trend reporting should follow the semantic clock of each KPI category.

### Case-entry trends

Use:
- `CancellationCase.created_at`

For:
- case volume over time
- incoming churn-intent trend
- top reasons over time

### Case-outcome trends

Use:
- `CancellationCase.finalized_at`

For:
- retention rate over time
- cancel rate over time
- pause rate over time

### Offer trends

Use:
- `RetentionOfferEvent.created_at`

For:
- number of offers proposed over time
- offer-type volume over time

### Applied-offer trends

Use:
- `RetentionOfferEvent.applied_at`

For:
- materialized offer effects over time

These time axes must not be collapsed into one generic trend clock.

## 8. KPI contract summary

### KPIs sourced from `CancellationCase`

- `top_reason_categories`
- `case_volume`
- `terminal_case_volume`
- `retention_rate`
- `cancel_rate`
- `pause_rate`
- `outcome_trend`

### KPIs sourced from `RetentionOfferEvent`

- `offer_acceptance_rate`
- `offer_rejection_rate`
- `offer_applied_rate`
- `acceptance_rate_by_offer_type`
- `offer_volume_by_type`
- `offer_trend`

### KPIs not primarily sourced from `Subscription`

Do not primarily calculate churn analytics from:
- `Subscription.status = cancelled`
- `Subscription.status = paused`

Why:
- these are lifecycle effects, not full records of cancellation handling
- they do not provide the required process semantics

## 9. Summary decision

The churn analytics contract for MVP is:
- process and outcome KPIs come from `CancellationCase`
- offer-decision KPIs come from `RetentionOfferEvent`
- final subscription lifecycle status is supporting context only

This keeps analytics aligned with the domain design:
- one process aggregate for cancellation handling
- one append-only event history for concrete offers
- one clear reporting source per KPI type
