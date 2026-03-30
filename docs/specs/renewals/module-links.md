# Reorder: Renewals Module Links Spec

This document covers step `2.3.5` from `documentation/implementation_plan.md`.

Goal:
- define the module links required by `Renewals`
- define the link direction and relationship semantics
- define how linked subscription and order data should be read in Admin
- define whether payment-related links are in MVP scope
- keep the read layer aligned with Medusa module-isolation patterns

This specification builds on:
- `reorder/docs/specs/renewals/admin-spec.md`
- `reorder/docs/specs/renewals/domain-model.md`
- `reorder/docs/specs/renewals/data-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`

## 1. Required module links

`Renewals` needs two module links in MVP:

- `renewalCycle <-> subscription`
- `renewalCycle <-> order`

These links are required because:
- the source record belongs to the custom `renewal` module
- the Admin UI must render linked subscription context
- the Admin UI must render the generated renewal order when present
- the plugin must remain isolated from the `subscription` and `order` modules
- later workflows and read models should be able to enrich the cycle with authoritative linked records without bypassing module isolation

## 2. Optional links

At this stage, payment-related links are optional and should not be part of the MVP link set.

Not required in MVP:
- `renewalCycle <-> payment_collection`
- `renewalCycle <-> payment`
- `renewalAttempt <-> payment_collection`
- `renewalAttempt <-> payment`

Why these are not required yet:
- the current Admin contract can be satisfied with attempt-level scalar references such as `payment_reference`
- the current renewal detail view does not require deep payment read models yet
- adding payment-related links too early would increase complexity before the final renewal workflow and Admin read model prove they are needed

If a later detail view needs authoritative payment-module enrichment:
- add those links in a later step
- keep them scoped to actual read-model requirements

## 3. One link per file

Following Medusa best practices:
- each module link must live in its own file
- do not group multiple `defineLink(...)` calls in one file

Recommended file structure:

```text
reorder/src/links/renewal-cycle-subscription.ts
reorder/src/links/renewal-cycle-order.ts
```

## 4. Link direction

The preferred direction is:
- from the custom module entity `renewalCycle`
- to the linked commerce or plugin module entities

Recommended definitions:

```ts
defineLink(
  { linkable: RenewalModule.linkable.renewalCycle.id, isList: true },
  SubscriptionModule.linkable.subscription
)

defineLink(RenewalModule.linkable.renewalCycle, OrderModule.linkable.order)
```

This direction is preferred because `RenewalCycle` is the custom operational entity managed in the plugin.

It follows the same practical pattern already used in the plugin for:
- `subscription <-> customer`
- `subscription <-> product`
- `subscription <-> variant`
- `subscription <-> order`

## 5. Why this direction is preferred

This direction matches the mental model of the feature:
- a renewal cycle belongs to one subscription context
- a renewal cycle may produce one generated order
- the custom entity is the domain object we manage in the plugin

It also keeps the renewal module aligned with the established link direction already used by `Subscriptions`.

## 6. Cardinality semantics

The module links express association, not ownership of business rules.

They should not be treated as the place that enforces:
- renewal eligibility
- approval requirements
- one-order-per-cycle execution rules
- retry semantics

Those behaviors belong to:
- the domain model
- workflow validation
- queue processing logic

### Subscription link semantics

A subscription may have many renewal cycles over time.

At the domain level:
- one `RenewalCycle` must always point to one `subscription_id`
- one subscription may be linked to many cycles

This is why the preferred link shape is list-oriented from the subscription perspective.

### Order link semantics

A renewal cycle may be linked to one generated order.

At the domain level:
- a cycle may have no order yet
- a succeeded cycle may have one generated order
- the final cycle summary should point to the winning generated order through `generated_order_id`

This does not prevent attempts from also storing `order_id` as a scalar diagnostic field.

## 7. Link usage versus scalar IDs

The model should keep both:
- scalar IDs in the `RenewalCycle` and `RenewalAttempt` entities
- module links for cross-module associations

Required scalar IDs:
- `RenewalCycle.subscription_id`
- `RenewalCycle.generated_order_id`
- `RenewalAttempt.order_id`

Why both are needed:
- scalar IDs are the primary mechanism for filtering, sorting, indexing, and queue processing
- links provide cross-module display reads without breaking module isolation
- this matches the practical pattern already used in the plugin’s `Subscriptions` area

## 8. Admin read strategy

Admin should distinguish between:
- source-record reads
- linked enrichment reads

### Source-record reads

Source-record reads should use `RenewalCycle` as the base.

They are responsible for:
- queue list pagination
- filtering by cycle state
- detail retrieval for one cycle
- attempt-history retrieval from same-module child records
- approval summary and generated-order reference

### Linked enrichment reads

Linked reads should be used to enrich Admin responses with:
- subscription reference
- subscription customer and product summary
- generated renewal order display data

Linked reads are for display enrichment and operational context only.

They should not replace the `RenewalCycle` record as the root of the read model.

## 9. Admin list read rules

For the Admin list:
- the root list entity should remain `RenewalCycle`
- list filters should primarily target direct fields on `RenewalCycle`
- linked subscription and order fields are display fields, not the primary control fields of the data model

Preferred direct-field filters:
- `status`
- `approval_required`
- `approval_status`
- `scheduled_for`
- `subscription_id`
- `generated_order_id`

If Admin later needs filtering by linked fields such as:
- subscription reference
- customer name
- product title
- order display ID

then treat this as linked-data filtering:
- use `query.index()` or a dedicated linked-query strategy if needed
- do not overload a simple source-record read path with assumptions that all cross-module filtering will work directly from the cycle root

## 10. Admin detail read rules

For the Admin detail view:
- retrieve the source `RenewalCycle` record first
- retrieve `RenewalAttempt` child records from the same module
- retrieve linked subscription and order display data as enrichment

The detail page should be able to show:
- cycle state
- approval summary
- applied pending-change snapshot
- attempt timeline
- subscription summary
- generated order summary

This keeps execution state rooted in the renewal module while still giving Admin the linked operational context it needs.

## 11. Linked data is not the source of truth

Linked subscription and order reads must be treated as enrichment only.

They must not replace:
- `subscription_id`
- `generated_order_id`
- `RenewalCycle.status`
- `RenewalCycle.approval_status`
- `RenewalCycle.applied_pending_update_data`

This matters because:
- subscription display data may change later
- order display data may evolve later
- the renewal module’s own operational state must remain self-contained and auditable

## 12. Query strategy guidance

Recommended query strategy for later implementation:

### Source list/detail

Use `RenewalCycle` as the source query root.

Use direct fields for:
- filtering
- sorting
- pagination
- queue selection

### Same-module history

Use the internal `RenewalAttempt` relation or dedicated same-module queries to retrieve:
- attempt timeline
- last known attempt state
- attempt ordering by `attempt_no` or timestamps

### Linked enrichment

Use module links and linked reads to enrich the result with:
- subscription reference and display context
- generated order display context

### Cross-module filtering

If filtering by linked fields becomes necessary:
- use `query.index()` or a dedicated linked-query strategy
- do not assume `query.graph()` can handle all linked filtering from the source root in a scalable way

## 13. Why payment links are deferred

Payment-related detail is not ignored; it is deferred intentionally.

Why deferral is preferred:
- the current domain contract already includes `payment_reference` on attempts
- the current Admin scope does not yet require payment-module deep linking
- later workflow design may show that `payment_collection` or `payment` links are not needed, or are needed only for attempt-level detail

This avoids premature coupling to payment entities before the read-model need is proven.

## 14. Final recommendation

The required MVP links are:
- `renewalCycle <-> subscription`
- `renewalCycle <-> order`

The recommended MVP non-goal is:
- no payment-related links yet

This keeps the design:
- aligned with Medusa module isolation
- consistent with the rest of the plugin
- sufficient for the current Admin queue and detail use cases
- open for later extension if payment-level detail becomes a real requirement
