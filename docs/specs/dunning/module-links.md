# Reorder: Dunning Module Links Spec

This document covers step `2.4.4` from `documentation/implementation_plan.md`.

Goal:
- define the module links required by `Dunning`
- define the link direction and relationship semantics
- define whether payment-related links are in MVP scope
- define how linked data should be read in Admin without breaking module isolation

This specification builds on:
- `reorder/docs/specs/dunning/domain-model.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/trigger-entry.md`
- `reorder/docs/specs/renewals/module-links.md`

The direction follows Medusa patterns:
- module links are used for cross-module relations, not same-module relations
- source records keep scalar IDs for filtering and scheduling
- linked data is used for enrichment, not as the primary source of operational truth
- optional payment links should be deferred until a concrete read or retry need is proven

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for cross-module link strategy
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. Required module links

Runtime note:
- the current implementation does not yet use dedicated dunning module links
- Admin reads currently rely on scalar IDs on `DunningCase` plus query-based enrichment
- this document remains the planned link strategy rather than the current runtime mechanism

`Dunning` needs three module links in MVP:

- `dunningCase <-> subscription`
- `dunningCase <-> renewalCycle`
- `dunningCase <-> order`

These links are required because:
- the source record belongs to the custom `dunning` module
- the Admin UI will need linked subscription context
- the Admin UI will need the originating renewal-cycle context
- the Admin UI may need linked renewal-order context when the debt event has an associated order
- the plugin must remain isolated from the `subscription`, `renewal`, and `order` modules

## 2. Optional links

At this stage, payment-related links are optional and should not be part of the MVP link set.

Deferred in MVP:
- `dunningCase <-> payment_collection`
- `dunningCase <-> payment_session`
- `dunningCase <-> payment`
- `dunningAttempt <-> payment_collection`
- `dunningAttempt <-> payment_session`
- `dunningAttempt <-> payment`

Why these are deferred:
- the current Dunning domain contract can be supported by scalar references and case-level error fields
- `renewal_order_id` already gives a stable path to order-linked payment collections in Medusa when needed later
- the current Admin scope does not yet prove the need for deep payment-module read models
- adding payment links too early would increase coupling to mutable payment artifacts before retry workflow design is finalized

If a later retry strategy or Admin detail requires authoritative payment-module enrichment:
- add the payment links in a later step
- scope them to the exact read or retry requirement
- prefer the smallest useful set, not full payment-graph linking by default

## 3. One link per file

Following Medusa best practices:
- each module link must live in its own file
- do not group multiple `defineLink(...)` calls in one file

Recommended file structure:

```text
reorder/src/links/dunning-subscription.ts
reorder/src/links/dunning-renewal.ts
reorder/src/links/dunning-order.ts
```

If payment links are added later, they should also follow the one-link-per-file rule.

## 4. Link direction

The preferred direction is:
- from the custom module entity `dunningCase`
- to the linked plugin or commerce module entities

Recommended definitions:

```ts
defineLink(
  {
    linkable: DunningModule.linkable.dunningCase.id,
    isList: true,
  },
  SubscriptionModule.linkable.subscription
)

defineLink(
  {
    linkable: DunningModule.linkable.dunningCase.id,
    isList: true,
  },
  RenewalModule.linkable.renewalCycle
)

defineLink(DunningModule.linkable.dunningCase, {
  linkable: OrderModule.linkable.order.id,
})
```

This direction is preferred because `DunningCase` is the custom operational entity managed in the plugin.

It also follows the practical pattern already used by:
- `subscription <-> customer`
- `subscription <-> product`
- `subscription <-> variant`
- `renewalCycle <-> subscription`
- `renewalCycle <-> order`

## 5. Why this direction is preferred

This direction matches the feature’s mental model:
- one dunning case belongs to one subscription context
- one dunning case belongs to one originating renewal cycle
- one dunning case may reference one renewal order
- the custom entity is the domain object managed by the plugin

It also keeps `Dunning` aligned with the established link direction already used in `Subscriptions` and `Renewals`.

## 6. Cardinality semantics

The module links express association, not ownership of business rules.

They should not be treated as the place that enforces:
- one-active-case-per-subscription rules
- debt-event uniqueness
- retry eligibility
- recovery transitions
- closure semantics

Those behaviors belong to:
- the domain model
- workflow validation
- scheduling logic

### Subscription link semantics

At the domain level:
- one `DunningCase` must always point to one `subscription_id`
- one subscription may have many dunning cases over time
- in MVP, only one case may be active at a time, but that is a domain invariant, not a link rule

This is why the preferred link shape is list-oriented from the subscription perspective.

### Renewal-cycle link semantics

At the domain level:
- one `DunningCase` must always point to one originating `renewal_cycle_id`
- one renewal cycle may be associated with at most one dunning case in the intended MVP semantics

The link still expresses association only.

The uniqueness of debt-event ownership should be enforced in the dunning domain and workflows, not by assuming the link table alone is sufficient.

### Order link semantics

At the domain level:
- a dunning case may have no `renewal_order_id`
- a dunning case may reference one renewal order when the debt event includes one

This does not prevent attempts from also storing `payment_reference` or later payment artifact references as scalar diagnostic fields.

## 7. Link usage versus scalar IDs

The model should keep both:
- scalar IDs on `DunningCase`
- module links for cross-module associations

Required scalar IDs:
- `DunningCase.subscription_id`
- `DunningCase.renewal_cycle_id`
- `DunningCase.renewal_order_id`

Why both are needed:
- scalar IDs are the primary mechanism for filtering, sorting, indexing, uniqueness checks, and scheduler processing
- links provide cross-module display reads without breaking module isolation
- this matches the practical pattern already used in `Subscriptions` and `Renewals`

## 8. Admin read strategy

Admin should distinguish between:
- source-record reads
- linked enrichment reads

### Source-record reads

Source-record reads should use `DunningCase` as the base.

They are responsible for:
- queue list pagination
- filtering by dunning state
- detail retrieval for one case
- attempt-history retrieval from same-module child records
- retry summary and closure summary

### Linked enrichment reads

Linked reads should be used to enrich Admin responses with:
- subscription reference and subscription summary
- originating renewal-cycle summary
- renewal-order display context

Linked reads are for display enrichment and operational context only.

They should not replace the `DunningCase` record as the root of the read model.

## 9. Admin list read rules

For the Admin list:
- the root list entity should remain `DunningCase`
- list filters should primarily target direct fields on `DunningCase`
- linked subscription, renewal, and order fields are display fields, not the primary control fields of the data model

Preferred direct-field filters:
- `status`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `last_attempt_at`
- `recovered_at`
- `closed_at`

If Admin later needs filtering by linked fields such as:
- subscription reference
- customer name
- renewal scheduled date
- order display ID

then treat this as linked-data filtering:
- use `query.index()` or a dedicated linked-query strategy if needed
- do not overload a simple source-record read path with assumptions that all linked filtering will work directly from the dunning root

## 10. Admin detail read rules

For the Admin detail view:
- retrieve the source `DunningCase` record first
- retrieve `DunningAttempt` child records from the same module
- retrieve linked subscription, renewal-cycle, and order display data as enrichment

The detail page should be able to show:
- case state
- retry schedule summary
- latest and historical recovery attempts
- subscription summary
- originating renewal summary
- renewal-order summary when present

This keeps recovery state rooted in the dunning module while still giving Admin the linked operational context it needs.

## 11. Linked data is not the source of truth

Linked subscription, renewal, and order reads must be treated as enrichment only.

They must not replace:
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `DunningCase.status`
- `DunningCase.next_retry_at`
- `DunningCase.last_payment_error_code`
- `DunningCase.last_payment_error_message`

This matters because:
- linked records may evolve later
- payment recovery state must remain self-contained and auditable in the dunning module
- Admin should not depend on mutable external state to understand the case’s operational meaning

## 12. Query strategy guidance

Recommended query strategy for later implementation:

### Source list/detail

Use `DunningCase` as the source query root.

Use direct fields for:
- filtering
- sorting
- pagination
- scheduler selection

### Same-module history

Use the internal `DunningAttempt` relation or dedicated same-module queries to retrieve:
- attempt timeline
- latest attempt state
- attempt ordering by `attempt_no` or timestamps

### Linked enrichment

Use module links and linked reads to enrich the result with:
- subscription reference and display context
- originating renewal-cycle context
- renewal-order display context

### Cross-module filtering

If filtering by linked fields becomes necessary:
- use `query.index()` or a dedicated linked-query strategy
- do not assume `query.graph()` can handle all linked filtering from the source root in a scalable way

## 13. Why payment links are deferred

Payment-related detail is deferred intentionally, not ignored.

Why deferral is preferred:
- the current case contract already has explicit latest error fields
- the current attempt contract already has `payment_reference`
- `renewal_order_id` may already provide a later path to payment-collection enrichment through Medusa’s existing order-payment links
- the retry strategy is not yet finalized, so locking link identity to payment artifacts now would be premature

When payment links become justified:
- the retry workflow must directly read or mutate payment artifacts as first-class linked records
- the Admin detail must show authoritative payment-collection or payment-session data that scalar references cannot satisfy
- observability or operational UX requires navigation to those payment records as linked entities

Until then:
- keep payment references as scalar operational data
- keep the module-link surface minimal

## 14. Final recommendation

For step `2.4.4`, the final recommendation is:

- required MVP links:
  - `dunningCase <-> subscription`
  - `dunningCase <-> renewalCycle`
  - `dunningCase <-> order`
- deferred links:
  - `payment_collection`
  - `payment_session`
  - `payment`
- source-record root for Admin:
  - `DunningCase`
- child same-module history:
  - `DunningAttempt`
- linked records are enrichment only and must not replace dunning-owned operational state
