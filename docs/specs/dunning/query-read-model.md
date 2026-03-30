# Reorder: Dunning Query and Admin Read Model Spec

This document covers step `2.4.10` from `documentation/implementation_plan.md`.

Goal:
- define the Admin read model for `Dunning`
- define separate query helpers for case list, case detail, and attempt history
- define how linked subscription, renewal, and order summaries are enriched
- define which sorting and filtering should happen in the database versus in memory
- provide a stable blueprint for later Admin API endpoints

This specification builds on:
- `reorder/docs/specs/dunning/domain-model.md`
- `reorder/docs/specs/dunning/data-model.md`
- `reorder/docs/specs/dunning/module-links.md`
- `reorder/docs/specs/dunning/state-machine.md`

The direction follows Medusa patterns:
- Admin read logic should live in dedicated query helpers, not in route handlers
- `query.graph()` should be the primary read mechanism for cross-module enrichment
- the custom module remains the read-model root
- database-backed sorting should be preferred for explicit scalar fields
- in-memory sorting should be reserved for enriched display-only fields

Implementation status:
- `Dunning` is not implemented yet
- this document is a design-time specification for the read model
- runtime source-of-truth docs for `Dunning` will be added after implementation

## 1. Read-model root

The Admin read model for `Dunning` should use `dunning_case` as the root entity.

Why:
- the queue is case-centric
- the detail page is case-centric
- retry status, next retry timing, closure state, and latest payment error all belong to the case
- attempts are child history, not the primary list root

This means:
- Admin list rows map from `DunningCase`
- Admin detail loads one `DunningCase`
- `DunningAttempt` data is attached as detail history

## 2. Query helper split

The recommended read-model split is:

- `listAdminDunningCases`
- `getAdminDunningCaseDetail`
- `listDunningAttemptsForCase`
- helper functions for linked summary enrichment

This mirrors the existing pattern already used in:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`

## 3. File location

The read-model helpers should live in:

- `src/modules/dunning/utils/admin-query.ts`

Supporting mapping helpers may live in the same file unless they become large enough to split later.

## 4. Case list query helper

### Proposed helper

```ts
listAdminDunningCases(container, input)
```

### Responsibility

This helper should:
- query `dunning_case` records for the Admin queue
- apply queue filters
- apply pagination
- apply supported sorting
- enrich rows with compact linked summaries
- return a list response already shaped for Admin DTO mapping

### List root fields

The queue list should primarily read:
- `id`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `status`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `last_payment_error_code`
- `last_payment_error_message`
- `last_attempt_at`
- `recovered_at`
- `closed_at`
- `recovery_reason`
- `created_at`
- `updated_at`

### Queue list should not load

The list query should not eagerly load:
- full attempt history
- full linked subscription detail
- full linked renewal detail
- full linked order detail
- unnecessary JSON blobs unless directly needed for list display

The list should stay light and queue-oriented.

## 5. Detail query helper

### Proposed helper

```ts
getAdminDunningCaseDetail(container, id)
```

### Responsibility

This helper should:
- retrieve one `dunning_case`
- attach retry schedule summary
- attach compact linked subscription summary
- attach compact linked renewal summary
- attach compact linked order summary
- attach attempt history
- return a detail-shaped Admin record

### Detail root fields

The detail helper should include:
- all queue list root fields
- `retry_schedule`
- `metadata`

The detail query is allowed to be heavier than the queue list.

## 6. Attempt-history query helper

### Proposed helper

```ts
listDunningAttemptsForCase(container, dunning_case_id)
```

### Responsibility

This helper should:
- retrieve all attempts for one case
- sort them in execution order
- map them into timeline/detail items

### Fields needed

- `id`
- `dunning_case_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`
- `metadata`
- `created_at`
- `updated_at`

### Ordering rule

The recommended default ordering is:
- `attempt_no ASC`

This keeps the detail timeline stable and easy to read.

## 7. Linked subscription summary

The read model should enrich queue and detail records with a linked subscription summary.

### Summary fields for list

Recommended list-level summary:
- subscription `id`
- subscription `reference`
- subscription `status`
- customer name from `customer_snapshot`
- product title and variant title from `product_snapshot`

### Summary fields for detail

The detail view may also include:
- `next_renewal_at`
- `last_renewal_at`
- selected stable subscription snapshots already owned by the `subscription` module when needed for display

### Important boundary

Linked subscription data is display enrichment only.

It must not replace:
- `DunningCase.status`
- `DunningCase.next_retry_at`
- `DunningCase.last_payment_error_code`
- `DunningCase.last_payment_error_message`

## 8. Linked renewal summary

The read model should also enrich records with a linked renewal summary.

### Summary fields for list

Recommended list-level summary:
- renewal cycle `id`
- `status`
- `scheduled_for`
- `generated_order_id`

### Summary fields for detail

The detail view may also include:
- `processed_at`
- `approval_required`
- `approval_status`
- `last_error`

As with subscription enrichment, this remains display-only enrichment.

## 9. Linked order summary

The read model should enrich records with a linked order summary when `renewal_order_id` exists.

### Summary fields for list

Recommended list-level summary:
- order `id`
- `display_id`
- `status`

### Summary fields for detail

The detail view may also include:
- `created_at`
- `payment_status`
- `fulfillment_status`
- `total`
- `currency_code`

This remains display-only enrichment.

## 10. Query mechanism choice

### Primary mechanism

Use `query.graph()` as the primary mechanism for:
- reading `dunning_case`
- reading `dunning_attempt`
- enriching linked subscription, renewal, and order summaries

Why:
- the read model needs cross-module enrichment
- this matches Medusa’s recommended Admin read pattern
- the current filters are mostly on module-owned scalar fields

### When not to use `query.index()`

The initial `Dunning` Admin read model should not require `query.index()` by default.

Reason:
- cross-module filtering is not yet the primary query shape
- the list is rooted in module-owned queue fields
- linked records are summary enrichments, not filter roots

If later Admin requirements demand filtering by linked subscription, renewal, or order fields, that can be added as a later design extension.

## 11. Filtering strategy

### Database-backed filters

The queue list should support DB-backed filters for:
- `status`
- `subscription_id`
- `renewal_cycle_id`
- `renewal_order_id`
- `attempt_count`
- `max_attempts`
- `next_retry_at` date ranges
- `last_attempt_at` date ranges
- `recovered_at` date ranges
- `closed_at` date ranges

These fields belong to the `dunning` module and should be filtered at the database layer.

### Search

For MVP, full free-text search across linked subscription, renewal, or order fields should not be the default requirement.

Recommended direction:
- exact filters on root scalar fields first
- linked-field search only later if Admin UX truly requires it

This keeps the first read model simpler and more predictable.

## 12. Sorting strategy

### Database-backed sorting

Preferred DB sort fields:
- `status`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `last_attempt_at`
- `recovered_at`
- `closed_at`
- `created_at`
- `updated_at`

Why:
- these are explicit root scalar fields
- the database can sort them efficiently
- they match queue and detail operational needs

### In-memory sorting

In-memory sorting should be reserved for display-only enriched fields such as:
- subscription reference
- customer name
- product title
- renewal scheduled date if only available through linked summary composition
- order display label

It should not be the default path.

If an in-memory sort is added:
- it must be explicitly validated
- it should operate only after the paged root records are fetched
- it should be limited to fields the database cannot sort without cross-module query complexity

## 13. DTO mapping strategy

The query helpers should map records into Admin-oriented normalized shapes rather than exposing raw query records.

Recommended direction:
- keep query and DTO mapping close together in the helper layer
- centralize enum/status mapping in helper functions
- normalize nullability and summary structures before the route layer returns the payload

This keeps route handlers thin and consistent with other plugin areas.

## 14. Detail assembly strategy

The detail helper should assemble the final response in this order:

1. load one `DunningCase`
2. load `DunningAttempt` child records
3. enrich linked subscription summary
4. enrich linked renewal summary
5. enrich linked order summary
6. map all parts into a detail DTO

Why this is preferred:
- the source root remains explicit
- same-module history stays separate from external enrichment
- linked lookups can stay optional depending on available references

## 15. Admin read boundaries

The Admin read model must keep clear boundaries:

- `DunningCase` is the source of truth for recovery lifecycle
- `DunningAttempt` is the source of truth for attempt history
- `Subscription` is only linked operational context
- `RenewalCycle` is only linked origin-event context
- `Order` is only linked payment/order context

This preserves the aggregate boundaries already established in earlier Dunning decisions.

## 16. Query strategy guidance

Recommended query strategy for later implementation:

### Source list/detail

Use `DunningCase` as the source query root.

Use direct fields for:
- filtering
- sorting
- pagination
- scheduler-oriented queue selection

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

## 17. Final recommendation

The recommended MVP Admin read model is:

- root entity:
  - `DunningCase`
- child history:
  - `DunningAttempt`
- linked enrichment:
  - `Subscription`
  - `RenewalCycle`
  - `Order`
- helper split:
  - `listAdminDunningCases`
  - `getAdminDunningCaseDetail`
  - `listDunningAttemptsForCase`
- sorting:
  - DB-backed for root scalar fields
  - in-memory only for display-only enriched fields

This is preferred because:
- it matches the established Medusa-style Admin read pattern in the plugin
- it keeps the custom module as the query root
- it avoids premature cross-module filtering complexity
- it supports both queue-oriented and detail-oriented Admin UX
