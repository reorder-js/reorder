# Reorder: Cancellation & Retention Query and Admin Read Model Spec

This document covers step `2.5.12` from `documentation/implementation_plan.md`.

Goal:
- define the Admin read model for `Cancellation & Retention`
- define separate query helpers for case list, case detail, and offer-event history
- define how linked subscription, dunning, and renewal summaries are enriched
- define which sorting and filtering should happen in the database versus in memory
- provide a stable blueprint for later Admin API endpoints

This specification builds on:
- `reorder/docs/specs/cancellation-retention/domain-model.md`
- `reorder/docs/specs/cancellation-retention/data-model.md`
- `reorder/docs/specs/cancellation-retention/module-links.md`
- `reorder/docs/specs/cancellation-retention/state-machine.md`
- `reorder/docs/specs/cancellation-retention/module-impact-semantics.md`

The direction follows Medusa patterns:
- Admin read logic should live in dedicated query helpers, not in route handlers
- `query.graph()` should be the primary read mechanism for source records and linked enrichment
- the custom module remains the read-model root
- database-backed sorting should be preferred for explicit scalar fields
- in-memory sorting should be reserved for small display-only enriched compositions

Implementation status:
- `Cancellation & Retention` is not implemented yet
- this document is the design-time source of truth for the Admin read model of the future cancellation module

## 1. Read-model root

The Admin read model for `Cancellation & Retention` should use `cancellation_case` as the root entity.

Why:
- the queue and list are case-centric
- the detail page is case-centric
- reason capture, recommendation state, outcome summary, and audit fields all belong to the case
- offer events are child history, not the primary list root

This means:
- Admin list rows map from `CancellationCase`
- Admin detail loads one `CancellationCase`
- `RetentionOfferEvent` data is attached as detail history

## 2. Query helper split

The recommended read-model split is:

- `listAdminCancellationCases`
- `getAdminCancellationCaseDetail`
- `listRetentionOfferEventsForCase`
- helper functions for linked summary enrichment

This mirrors the existing pattern already used in:
- `Plans & Offers`
- `Renewals`
- `Dunning`

## 3. File location

The read-model helpers should live in:

- `reorder/src/modules/cancellation/utils/admin-query.ts`

Supporting mapping helpers may live in the same file unless they become large enough to split later.

## 4. Case list query helper

### Proposed helper

```ts
listAdminCancellationCases(container, input)
```

### Responsibility

This helper should:
- query `cancellation_case` records for the Admin list
- apply filters
- apply pagination
- apply supported sorting
- enrich rows with compact linked subscription summaries
- return a list response already shaped for Admin DTO mapping

### List root fields

The list should primarily read:
- `id`
- `subscription_id`
- `status`
- `reason`
- `reason_category`
- `recommended_action`
- `final_outcome`
- `finalized_at`
- `cancellation_effective_at`
- `created_at`
- `updated_at`

### List should not load

The list query should not eagerly load:
- full offer-event history
- full linked subscription detail
- full dunning detail
- full renewal detail
- unnecessary JSON blobs unless directly needed for list display

The list should stay light and operationally filterable.

## 5. Detail query helper

### Proposed helper

```ts
getAdminCancellationCaseDetail(container, id)
```

### Responsibility

This helper should:
- retrieve one `cancellation_case`
- attach process summary and audit summary
- attach compact linked subscription summary
- attach optional dunning summary
- attach optional renewal summary
- attach offer-event history
- return a detail-shaped Admin record

### Detail root fields

The detail helper should include:
- all list root fields
- `notes`
- `finalized_by`
- `metadata`

The detail query is allowed to be heavier than the list query.

## 6. Offer-history query helper

### Proposed helper

```ts
listRetentionOfferEventsForCase(container, cancellation_case_id)
```

### Responsibility

This helper should:
- retrieve all events for one case
- sort them in stable chronological order
- map them into timeline/detail items

### Fields needed

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
- `created_at`
- `updated_at`

### Ordering rule

The recommended default ordering is:
- `created_at ASC`

This keeps the detail timeline stable and easy to read.

## 7. Linked subscription summary

The read model should enrich list and detail records with a linked subscription summary.

### Summary fields for list

Recommended list-level summary:
- subscription `id`
- subscription `reference`
- subscription `status`
- `next_renewal_at`
- customer name from `customer_snapshot`
- product title and variant title from `product_snapshot`

### Summary fields for detail

The detail view may also include:
- `last_renewal_at`
- `paused_at`
- `cancelled_at`
- `cancel_effective_at`
- `pending_update_data` when needed for operational context

### Important boundary

Linked subscription data is display enrichment only.

It must not replace:
- `CancellationCase.status`
- `CancellationCase.reason_category`
- `CancellationCase.recommended_action`
- `CancellationCase.final_outcome`

## 8. Linked dunning summary

The read model should expose dunning context as a separate enrichment helper, not as part of the root case query.

### Proposed helper

```ts
getDunningSummaryForCancellationCase(container, subscription_id)
```

### Responsibility

This helper should return only compact operational context such as:
- whether an active `DunningCase` exists
- `dunning_case.id`
- `status`
- `attempt_count`
- `next_retry_at`
- `last_payment_error_message`

It should not load:
- full attempt history
- full dunning detail graph

### Why it should stay separate

- `DunningCase` is not a primary anchor of `CancellationCase`
- dunning is only contextual to cancellation handling
- keeping it separate avoids mixing two source roots into one heavy query path

## 9. Linked renewal summary

The read model should expose renewal context as a separate enrichment helper.

### Proposed helper

```ts
getRenewalSummaryForCancellationCase(container, subscription_id)
```

### Responsibility

This helper should return compact operational context such as:
- current or nearest renewal-cycle summary
- `renewal_cycle.id`
- `status`
- `scheduled_for`
- `approval_status`
- `generated_order_id`

It should not load:
- full renewal history
- full attempt history

### Why it should stay separate

- `CancellationCase` is not anchored to one concrete renewal cycle
- renewal data is display and operator context, not the source of truth of the cancellation process

## 10. Query mechanism choice

### Primary mechanism

Use `query.graph()` as the primary mechanism for:
- reading `cancellation_case`
- reading `retention_offer_event`
- enriching linked subscription summaries

Why:
- the read model needs source-record reads plus linked display enrichment
- this matches Medusa’s recommended Admin read pattern
- the current filters are mostly on module-owned scalar fields

### Dunning and renewal enrichment

Dunning and renewal summaries should use query-time enrichment by `subscription_id`.

They should not be treated as direct owned child reads of the cancellation module.

### When not to use `query.index()`

The initial Admin read model should not require `query.index()` by default.

Reason:
- the list is rooted in module-owned case fields
- linked records are summary enrichments, not filter roots

If later the Admin list truly needs filtering by linked fields such as:
- subscription reference
- customer name
- product title
- dunning status
- renewal scheduled date

then treat this as linked-data filtering and introduce `query.index()` or a dedicated linked-query strategy explicitly.

## 11. Sorting rules

The read model should divide sorting into:
- database-backed sorting
- optional in-memory sorting for small enriched display-only compositions

### Database-backed sorting

Preferred sortable root fields:
- `created_at`
- `updated_at`
- `status`
- `final_outcome`
- `reason_category`
- `finalized_at`

For offer events:
- `created_at`
- `decided_at`
- `applied_at`

These fields should be sorted in the database, not in memory.

### In-memory sorting

In-memory sorting is acceptable only for:
- small detail-level enriched sections
- display-only ordering after a single case and its related summaries are already loaded

### What must not rely on in-memory sorting

The paginated case list must not rely on in-memory sorting by fields such as:
- subscription reference
- customer name
- product title
- dunning status
- renewal scheduled date

Why:
- it breaks pagination correctness
- Medusa `query.graph()` sorting does not work as a normal root sort on linked fields
- those fields belong to enrichment, not to the source list root

## 12. Summary decision

The Admin read model should use:
- `listAdminCancellationCases`
- `getAdminCancellationCaseDetail`
- `listRetentionOfferEventsForCase`
- linked-summary helpers for subscription, dunning, and renewal context

With these key principles:
- `CancellationCase` remains the read-model root
- `RetentionOfferEvent` remains same-module child history
- subscription is the primary linked enrichment
- dunning and renewal are optional query-time context enrichments
- database-backed sorting is the default for source scalar fields
- in-memory sorting is limited to small display-only detail compositions
