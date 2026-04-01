# Reorder: Cancellation & Retention Module Links Spec

This document covers step `2.5.11` from `documentation/implementation_plan.md`.

Goal:
- define the module links required by `Cancellation & Retention`
- define the link direction and relationship semantics
- decide whether links to `renewal_cycle` or `dunning_case` are needed in MVP
- define how linked data should be read in Admin without breaking module isolation

This specification builds on:
- `reorder/docs/specs/cancellation-retention/data-model.md`
- `reorder/docs/specs/cancellation-retention/source-of-truth-semantics.md`
- `reorder/docs/specs/cancellation-retention/module-impact-semantics.md`
- `reorder/docs/specs/renewals/module-links.md`
- `reorder/docs/specs/dunning/module-links.md`

The direction follows Medusa patterns:
- module links are used for cross-module relations, not same-module relations
- source records keep scalar IDs for filtering, sorting, and workflow guards
- linked data is used for enrichment, not as the primary source of operational truth
- optional links should be deferred until a concrete aggregate anchor or read-model need is proven

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for cross-module link strategy of the future cancellation module

## 1. Required module links

`Cancellation & Retention` needs one required module link in MVP:

- `cancellationCase <-> subscription`

This link is required because:
- `CancellationCase` always belongs to one subscription context
- the Admin UI will need linked subscription context on list and detail views
- the plugin must remain isolated from the `subscription` module
- later workflows and read models should be able to enrich the case with authoritative subscription data without bypassing module isolation

## 2. Optional links

At this stage, links to `renewal_cycle` and `dunning_case` are optional and should not be part of the MVP link set.

Deferred in MVP:
- `cancellationCase <-> renewalCycle`
- `cancellationCase <-> dunningCase`

Why these are deferred:
- `CancellationCase` is not anchored to one concrete `RenewalCycle`
- `CancellationCase` is not anchored to one concrete `DunningCase`
- `Renewals` and `Dunning` remain separate operational domains with their own aggregates
- the current Admin contract can be satisfied by query-time enrichment based on `subscription_id`
- adding those links too early would imply stronger ownership coupling than the current design allows

If a later detail view or workflow needs authoritative direct association:
- add the link in a later step
- scope it to the exact read or mutation requirement
- do not preemptively link aggregates that are not primary anchors of the cancellation domain

## 3. One link per file

Following Medusa best practices:
- each module link must live in its own file
- do not group multiple `defineLink(...)` calls in one file

Recommended file structure:

```text
reorder/src/links/cancellation-subscription.ts
```

If optional links are added later, they should also follow the one-link-per-file rule.

## 4. Link direction

The preferred direction is:
- from the custom module entity `cancellationCase`
- to the linked `subscription` entity

Recommended definition:

```ts
defineLink(
  {
    linkable: CancellationModule.linkable.cancellationCase.id,
    isList: true,
  },
  SubscriptionModule.linkable.subscription
)
```

This direction is preferred because `CancellationCase` is the custom operational entity managed in the plugin.

It also follows the practical pattern already used by:
- `renewalCycle <-> subscription`
- `dunningCase <-> subscription`

## 5. Why this direction is preferred

This direction matches the feature’s mental model:
- one cancellation case belongs to one subscription context
- one subscription may have many historical cancellation cases
- the custom entity is the domain object managed by the plugin

It also keeps `Cancellation & Retention` aligned with the established link direction already used in `Renewals` and `Dunning`.

## 6. Cardinality semantics

The module link expresses association, not ownership of business rules.

It should not be treated as the place that enforces:
- one-active-case-per-subscription rules
- cancellation entry eligibility
- terminal state transitions
- retention-offer semantics
- final cancellation rules

Those behaviors belong to:
- the domain model
- workflow validation
- process-state transitions

### Subscription link semantics

At the domain level:
- one `CancellationCase` must always point to one `subscription_id`
- one subscription may have many cancellation cases over time
- in MVP, only one case may be active at a time, but that is a domain invariant, not a link rule

This is why the preferred link shape is list-oriented from the subscription perspective.

## 7. Link usage versus scalar IDs

The model should keep both:
- scalar IDs on `CancellationCase`
- module links for cross-module associations

Required scalar IDs:
- `CancellationCase.subscription_id`

Why both are needed:
- scalar ID is the primary mechanism for filtering, sorting, indexing, and active-case lookup
- the link provides cross-module display reads without breaking module isolation
- this matches the practical pattern already used in `Renewals` and `Dunning`

At this stage, the cancellation module should not add scalar IDs such as:
- `renewal_cycle_id`
- `dunning_case_id`

Why:
- those records are not primary anchors of the cancellation aggregate
- their detail can be enriched later through query-time reads by `subscription_id`

## 8. Admin read strategy

Admin should distinguish between:
- source-record reads
- linked enrichment reads

### Source-record reads

Source-record reads should use `CancellationCase` as the base.

They are responsible for:
- list pagination
- filtering by case state
- detail retrieval for one case
- offer-history retrieval from same-module child records
- final outcome and audit summary

### Linked enrichment reads

Linked reads should be used to enrich Admin responses with:
- subscription reference
- subscription lifecycle summary
- customer and product display context from the subscription view

Query-time enrichment may also be used to add:
- active dunning summary
- renewal summary

Linked and query-time reads are for display enrichment and operational context only.

They should not replace the `CancellationCase` record as the root of the read model.

## 9. Admin list read rules

For the Admin list:
- the root list entity should remain `CancellationCase`
- list filters should primarily target direct fields on `CancellationCase`
- linked subscription fields are display fields, not the primary control fields of the data model

Preferred direct-field filters:
- `status`
- `final_outcome`
- `reason_category`
- `recommended_action`
- `subscription_id`
- `created_at`

If Admin later needs filtering by linked fields such as:
- subscription reference
- customer name
- product title

then treat this as linked-data filtering:
- use `query.index()` or a dedicated linked-query strategy if needed
- do not overload a simple source-record read path with assumptions that all cross-module filtering will work directly from the cancellation root

## 10. Admin detail read rules

For the Admin detail view:
- retrieve the source `CancellationCase` record first
- retrieve `RetentionOfferEvent` child records from the same module
- retrieve linked subscription display data as enrichment
- retrieve dunning or renewal summary only as additional operational context when needed

The detail page should be able to show:
- case state
- reason and recommendation
- offer timeline
- final outcome summary
- subscription summary
- optional dunning summary
- optional renewal summary

This keeps process state rooted in the cancellation module while still giving Admin the linked operational context it needs.

## 11. Linked data is not the source of truth

Linked subscription, dunning, and renewal reads must be treated as enrichment only.

They must not replace:
- `CancellationCase.subscription_id`
- `CancellationCase.status`
- `CancellationCase.reason_category`
- `CancellationCase.recommended_action`
- `CancellationCase.final_outcome`
- `CancellationCase.cancellation_effective_at`

This matters because:
- linked data may change later
- linked display context is not the cancellation process aggregate
- the cancellation module’s own operational state must remain self-contained and auditable

## 12. Query strategy guidance

Recommended query strategy for later implementation:

### Source list/detail

Use `CancellationCase` as the source query root.

Use direct fields for:
- filtering
- sorting
- pagination
- case lookup

### Same-module history

Use the internal `RetentionOfferEvent` relation or dedicated same-module queries to retrieve:
- offer timeline
- event ordering by `created_at`
- offer-level decision history

### Linked enrichment

Use module links and query-based enrichment to add:
- subscription reference and display context
- active lifecycle summary from the subscription view

Use query-time enrichment, not direct aggregate ownership, for:
- active dunning context
- renewal context shown on detail

## 13. Summary decision

The MVP link strategy is:
- required link:
  - `cancellationCase <-> subscription`
- deferred links:
  - `cancellationCase <-> renewalCycle`
  - `cancellationCase <-> dunningCase`

With these key principles:
- `CancellationCase` remains the source-record root of Admin reads
- `RetentionOfferEvent` remains same-module child history
- linked subscription data is enrichment
- dunning and renewal context are optional query-time enrichment, not primary linked ownership
