# Activity Log Architecture

This document describes the architectural boundary decided for the future `Activity Log` area in the `Reorder` plugin.

It documents the source-of-truth and ownership rules agreed before implementation starts.

## Goal

The `Activity Log` area is intended to provide a unified operator-facing audit trail for subscription-related business events across the plugin.

Its purpose is to:
- show important lifecycle events for one subscription in one place
- give operators a readable audit trail across multiple recurring-commerce areas
- support future Admin list, detail, and timeline views

Its purpose is not to replace the source domain models that already own their own business state.

## Architectural Role

`Activity Log` is planned as a dedicated append-only business audit layer.

It should aggregate important subscription-related events emitted by:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

The key architectural decision is:

- `Activity Log` is the canonical append-only audit trail for operator-facing business events around a subscription.
- `Activity Log` is not the source of truth for domain state owned by the existing modules.

This means the log is a cross-domain audit view, not a replacement for existing aggregates.

## Ownership Boundaries

The current ownership model of the plugin remains unchanged.

`Subscriptions` remain the source of truth for:
- subscription lifecycle state
- cadence and renewal scheduling fields
- shipping address and pending plan change materialization

`Plans & Offers` remain the source of truth for:
- subscription offer configuration
- allowed billing frequencies
- offer rules and effective policy resolution

`Renewals` remain the source of truth for:
- renewal cycle execution state
- renewal attempt history
- approval decisions and execution outcomes

`Dunning` remains the source of truth for:
- payment recovery state
- retry schedule
- dunning attempt history
- recovered and unrecovered outcomes

`Cancellation & Retention` remains the source of truth for:
- cancellation process state
- retention recommendation state
- retention offer history
- churn reason and final cancellation outcome

`Activity Log` does not take ownership away from any of the above modules.

## Relation to Existing Audit Fields and Metadata

The plugin already stores audit-oriented data inside domain-specific modules.

Examples include:
- explicit actor fields such as `finalized_by`, `decided_by`, and approval-related fields
- append-only `manual_actions` metadata in `Cancellation & Retention`
- renewal and dunning attempt history
- workflow-specific metadata and manual-operation context

These fields remain valid and should stay in their owning modules.

The architectural role of `Activity Log` is different:
- domain modules keep detailed, module-local audit context
- `Activity Log` provides a unified cross-domain audit trail for operators

This means:
- `Activity Log` may summarize or reference important outcomes from those modules
- it should not replace detailed attempt history or module-specific metadata
- it should not become a dumping ground for every internal field or diagnostic value

## Business Audit Trail vs Operational Logging

The plugin already uses structured operational logging and scheduler summary metrics in areas such as `Renewals`, `Dunning`, and `Cancellation & Retention`.

Those operational logs remain a separate concern.

`Activity Log` should contain only business-significant, operator-facing events, such as:
- subscription paused, resumed, canceled
- plan change scheduled or applied
- shipping address updated
- renewal attempted, succeeded, failed
- dunning started, retried, recovered, unrecovered
- cancellation case started
- retention offer applied
- cancellation finalized

`Activity Log` should not contain low-level operational or diagnostic noise, such as:
- scheduler heartbeat and batch summaries
- lock-acquisition diagnostics
- retry internals and step-level debug output
- infrastructure or transport-layer errors
- sensitive payment details

Those concerns belong in structured logs, observability helpers, and operational metrics, not in the business audit trail.

## Medusa Boundary Rules

The decision follows Medusa's modular architecture rules:
- domain modules stay isolated
- cross-module business coordination happens in workflows
- read models can aggregate data for Admin without transferring ownership between modules

For `Activity Log`, this means:
- log entries should be created from workflow-backed mutation paths
- module services should keep owning their own state
- the future Admin read layer may aggregate events across domains, but it must not redefine domain ownership

## Event Record Contract

The future `Activity Log` should store one append-only record per business-significant subscription event.

The logical event contract is:
- `id`
- `subscription_id`
- `customer_id`
- `event_type`
- `actor_type`
- `actor_id`
- `previous_state`
- `new_state`
- `changed_fields`
- `reason`
- `metadata`
- `created_at`

### Field Semantics

`id`
- unique event identifier

`subscription_id`
- required
- the log is centered on one subscription lifecycle

`customer_id`
- optional but persisted when known
- used for Admin filtering and customer-level audit lookups

`event_type`
- required
- one stable domain event name from the taxonomy defined below

`actor_type`
- required
- indicates who or what triggered the event
- current planned values:
  - `user`
  - `system`
  - `scheduler`

`actor_id`
- optional
- stores the admin user ID or other actor identifier when available

`previous_state`
- optional JSON summary
- stores only the event-relevant state before the mutation
- must not contain full raw copies of owning aggregates

`new_state`
- optional JSON summary
- stores only the event-relevant state after the mutation
- must not contain full raw copies of owning aggregates

`changed_fields`
- optional structured diff
- should capture a compact before/after representation of the fields that changed
- intended shape:
  - array of field-level entries such as `field`, `before`, `after`

`reason`
- optional business-facing or operator-facing reason
- for example approval reason, retention decision reason, or manual cancellation reason

`metadata`
- optional JSON
- used for stable references and limited technical context, such as:
  - `renewal_cycle_id`
  - `dunning_case_id`
  - `cancellation_case_id`
  - `retention_offer_event_id`
  - `order_id`
  - `correlation_id`
- should not contain sensitive payment details or unbounded diagnostic payloads

`created_at`
- required event timestamp

## State Payload Rules

The event record is intended to stay stable and operator-readable over time.

Because of that, `previous_state`, `new_state`, and `changed_fields` should follow these rules:
- store small event-specific summaries, not full entity snapshots
- include only the fields needed to explain what changed
- avoid copying large nested domain objects
- avoid leaking sensitive payment or infrastructure data

Examples of good event-level state summaries:
- status before and after a pause or resume
- pending plan change before and after approval decision
- retry schedule before and after manual override
- cancellation recommendation before and after smart-cancel evaluation

Examples of data that should stay outside the event state payload:
- full attempt history arrays
- full subscription snapshots
- full order payloads
- raw provider diagnostics

## Event Type Taxonomy

The `Activity Log` should use a stable, explicit taxonomy grouped by domain prefix.

### Subscription Events

- `subscription.paused`
- `subscription.resumed`
- `subscription.canceled`
- `subscription.plan_change_scheduled`
- `subscription.shipping_address_updated`

### Renewal Events

- `renewal.cycle_created`
- `renewal.approval_approved`
- `renewal.approval_rejected`
- `renewal.force_requested`
- `renewal.succeeded`
- `renewal.failed`

### Dunning Events

- `dunning.started`
- `dunning.retry_executed`
- `dunning.recovered`
- `dunning.unrecovered`
- `dunning.retry_schedule_updated`

### Cancellation & Retention Events

- `cancellation.case_started`
- `cancellation.recommendation_generated`
- `cancellation.offer_applied`
- `cancellation.reason_updated`
- `cancellation.finalized`

## Scope Decision for Plans & Offers

`Plans & Offers` are part of the recurring-commerce runtime, but they should not introduce standalone global configuration events into the subscription-centric `Activity Log` in v1.

Reasoning:
- `Activity Log` is centered around one subscription
- `Plans & Offers` primarily manage product-level or variant-level configuration
- create, update, and toggle operations on offer configuration are not inherently events of one specific subscription

So the current scope decision is:
- do not add standalone `plan-offer.*` events to `Activity Log` v1
- capture the subscription-facing effect of plan configuration through subscription and renewal events instead

Examples:
- a future plan change requested on a subscription is represented by `subscription.plan_change_scheduled`
- renewal success or failure after policy validation is represented by renewal events

If configuration-audit requirements become important later, they should be modeled as a separate configuration audit trail rather than folded into the per-subscription activity stream.

## Summary

The agreed boundary for `Activity Log` is:

- it is a canonical append-only business audit trail for subscription-related events
- it is not the source of truth for subscription, renewal, dunning, or cancellation state
- existing module-local audit fields and histories remain in place
- structured operational logs remain separate from the business audit trail
- cross-domain event recording should happen through workflow orchestration, consistent with Medusa patterns
- event records should stay compact, stable, and operator-readable
- `Plans & Offers` configuration changes are out of scope for standalone `Activity Log` v1 events
