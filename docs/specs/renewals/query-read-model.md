# Reorder: Renewals Query and Admin Read Model Spec

This document covers step `2.3.10` from `documentation/implementation_plan.md`.

Goal:
- define the Admin read model for `Renewals`
- define separate query helpers for queue list, cycle detail, and attempt history
- define how linked subscription and order summaries are enriched
- define which sorting and filtering should happen in the database versus in memory
- provide a stable blueprint for later Admin API endpoints

This specification builds on:
- `reorder/docs/specs/renewals/admin-spec.md`
- `reorder/docs/specs/renewals/domain-model.md`
- `reorder/docs/specs/renewals/data-model.md`
- `reorder/docs/specs/renewals/module-links.md`
- `reorder/docs/specs/renewals/state-machine.md`
- `reorder/docs/specs/renewals/billing-anchor-semantics.md`

The direction follows Medusa patterns:
- Admin read logic should live in dedicated query helpers, not in route handlers
- `query.graph()` should be the primary read mechanism for cross-module enrichment
- the custom module remains the read-model root
- database-backed sorting should be preferred for explicit scalar fields
- in-memory sort should be reserved for enriched display-only fields

Implementation status:
- the `Renewals` area is now implemented
- treat this document as design-time context and read-model rationale
- the current runtime source of truth lives in:
  - `reorder/docs/architecture/renewals.md`
  - `reorder/docs/api/admin-renewals.md`
  - `reorder/docs/admin/renewals.md`
  - `reorder/docs/testing/renewals.md`

## 1. Read-model root

The Admin read model for `Renewals` should use `renewal_cycle` as the root entity.

Why:
- the queue is cycle-centric
- the detail page is cycle-centric
- approval state, generated order, and execution status all belong to the cycle
- attempts are child history, not the primary list root

This means:
- Admin list rows map from `RenewalCycle`
- Admin detail loads one `RenewalCycle`
- `RenewalAttempt` data is attached as detail history

## 2. Query helper split

The recommended read-model split is:

- `listAdminRenewalCycles`
- `getAdminRenewalCycleDetail`
- `listRenewalAttemptsForCycle`
- helper functions for linked summary enrichment

This mirrors the existing pattern used in `Subscriptions` and `Plans & Offers`.

## 3. File location

The read-model helpers should live in:

- `src/modules/renewal/utils/admin-query.ts`

Supporting mapping helpers may live in the same file unless they become large enough to split later.

## 4. Queue list query helper

### Proposed helper

```ts
listAdminRenewalCycles(container, input)
```

### Responsibility

This helper should:
- query `renewal_cycle` records for the Admin queue
- apply queue filters
- apply pagination
- apply supported sorting
- enrich rows with compact linked summaries
- return a list response already shaped for Admin DTO mapping

### List root fields

The queue list should primarily read:
- `id`
- `subscription_id`
- `scheduled_for`
- `processed_at`
- `status`
- `approval_required`
- `approval_status`
- `generated_order_id`
- `last_error`
- `attempt_count`
- `created_at`
- `updated_at`

### Queue list should not load

The list query should not eagerly load:
- full attempt history
- full linked subscription detail
- full linked order detail
- unnecessary JSON snapshots

The list should stay light and queue-oriented.

## 5. Detail query helper

### Proposed helper

```ts
getAdminRenewalCycleDetail(container, id)
```

### Responsibility

This helper should:
- retrieve one `renewal_cycle`
- attach approval summary
- attach applied pending-change snapshot
- attach compact linked subscription summary
- attach compact linked order summary
- attach attempt history
- return a detail-shaped Admin record

### Detail root fields

The detail helper should include:
- all queue list root fields
- `approval_decided_at`
- `approval_decided_by`
- `approval_reason`
- `applied_pending_update_data`
- `metadata`

The detail query is allowed to be heavier than the queue list.

## 6. Attempt-history query helper

### Proposed helper

```ts
listRenewalAttemptsForCycle(container, renewal_cycle_id)
```

### Responsibility

This helper should:
- retrieve all attempts for one cycle
- sort them in execution order
- map them into timeline/detail items

### Fields needed

- `id`
- `renewal_cycle_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `payment_reference`
- `order_id`
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
- `product_id`
- `variant_id`
- `frequency_interval`
- `frequency_value`
- `next_renewal_at`

### Summary fields for detail

The detail view may also include:
- `last_renewal_at`
- `pending_update_data`
- stable subscription snapshots already owned by the `subscription` module when needed for display

### Important boundary

Linked subscription data is display enrichment only.

It must not replace:
- `RenewalCycle.status`
- `RenewalCycle.approval_status`
- `RenewalCycle.generated_order_id`
- `RenewalCycle.applied_pending_update_data`

## 8. Linked order summary

The read model should also enrich records with a linked order summary when `generated_order_id` exists.

### Summary fields for list

Recommended list-level summary:
- order `id`
- `display_id`
- order `status`

### Summary fields for detail

The detail view may also include:
- `created_at`
- `payment_status`
- `fulfillment_status`
- `total`
- `currency_code`

As with subscription enrichment, this remains display-only enrichment.

## 9. Query mechanism choice

### Primary mechanism

Use `query.graph()` as the primary mechanism for:
- reading `renewal_cycle`
- reading `renewal_attempt`
- enriching linked subscription and order summaries

Why:
- the read model needs cross-module enrichment
- this matches Medusa’s recommended Admin read pattern
- the current filters are mostly on module-owned scalar fields

### When not to use `query.index()`

The initial `Renewals` Admin read model should not require `query.index()` by default.

Reason:
- cross-module filtering is not yet the primary query shape
- the list is rooted in module-owned queue fields
- linked records are summary enrichments, not filter roots

If later Admin requirements demand filtering by linked subscription or order fields, that can be added as a later design extension.

## 10. Filtering strategy

### Database-backed filters

The queue list should support DB-backed filters for:
- `status`
- `approval_required`
- `approval_status`
- `subscription_id`
- `generated_order_id`
- `scheduled_for` date ranges
- `processed_at` date ranges

These fields belong to the `renewal` module and should be filtered at the database layer.

### Search

For MVP, full free-text search across linked subscription or order fields should not be the default requirement.

Recommended direction:
- exact filters on root scalar fields first
- linked-field search only later if Admin UX truly requires it

This keeps the first read model simpler and more predictable.

## 11. Sorting strategy

### Database-backed sorting

Preferred DB sort fields:
- `scheduled_for`
- `processed_at`
- `status`
- `approval_status`
- `attempt_count`
- `created_at`
- `updated_at`

Why:
- these are explicit root scalar fields
- the database can sort them efficiently
- they match queue and detail operational needs

### In-memory sorting

In-memory sorting should be reserved for display-only enriched fields such as:
- subscription reference
- order display label
- other computed display strings

It should not be the default path.

If an in-memory sort is added:
- it must be explicitly validated
- it should operate only after the paged root records are fetched
- it should be limited to fields the database cannot sort without cross-module query complexity

## 12. DTO mapping strategy

The read model should map from internal query records into Admin-oriented DTOs.

### Queue list shape

Each list item should include:
- cycle identifiers and timestamps
- cycle statuses
- approval summary
- compact subscription summary
- compact order summary
- attempt count
- last error summary

### Detail shape

The detail response should include:
- all list data
- full approval summary
- applied pending-change snapshot
- attempts timeline
- expanded subscription summary
- expanded order summary

This keeps Admin UI code thin and display-focused.

## 13. Performance guidance

The list helper should optimize for:
- small field selections
- root-entity filtering first
- minimal linked fields

The detail helper may load more data, but should still:
- request only fields actually needed by the detail page
- avoid loading unrelated linked collections

Attempt history should not be loaded for every queue row.

## 14. Error and not-found behavior

The list helper should:
- return empty results when no cycles match filters

The detail helper should:
- throw a domain-appropriate not-found error when the cycle does not exist

The attempt-history helper should:
- return an empty array when a cycle has no attempts yet

## 15. Final recommendation

The recommended Admin read-model structure for `Renewals` is:

- `listAdminRenewalCycles`
  - queue-oriented root list
  - DB-backed filtering and sorting on cycle-owned scalar fields
  - lightweight linked summaries

- `getAdminRenewalCycleDetail`
  - cycle-root detail
  - approval and applied-change fields
  - linked subscription and order summaries
  - attached attempt timeline

- `listRenewalAttemptsForCycle`
  - child-history helper
  - ordered by `attempt_no`

This is preferred because it matches the existing plugin architecture, follows Medusa’s query patterns, and keeps the Admin API thin while preserving module isolation.
