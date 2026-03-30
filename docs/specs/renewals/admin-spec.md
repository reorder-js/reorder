# Reorder: Renewals Admin UI and API Spec

This document covers step `2.3.1` from `documentation/implementation_plan.md`.

Goal:
- define Admin DTO types for `Renewals`
- define the list/detail contract for an Admin `DataTable`
- define `force`, `approve-changes`, and `reject-changes` payloads for later backend steps
- define a UX contract aligned with standard Medusa Admin patterns

Artifacts produced in this step:
- Admin DTO types: `reorder/src/admin/types/renewal.ts`
- this document as the specification for columns, actions, filters, and request/response shapes

Note:
- this is a design specification for later steps, not the final module implementation
- backend, workflows, and the Admin UI route will be implemented in later `2.3` steps

Implementation status:
- the `Renewals` area is now implemented
- treat this document as design-time context and historical specification input
- the current runtime source of truth lives in:
  - `reorder/docs/architecture/renewals.md`
  - `reorder/docs/api/admin-renewals.md`
  - `reorder/docs/admin/renewals.md`
  - `reorder/docs/testing/renewals.md`

## 1. Design assumptions

`Renewals` is an operational Admin view used to monitor and control renewal execution for subscriptions.

At the contract level, we assume:
- one Admin record represents one renewal cycle
- one renewal cycle belongs to one subscription
- one renewal cycle may have multiple attempts
- one renewal cycle may generate one renewal order
- one renewal cycle may require approval before pending changes can be applied
- Admin must be able to see both queue-level information and attempt-level detail

Following Medusa conventions:
- the list is based on `DataTable`
- read endpoints return paginated DTOs for the table and detail page
- mutations are exposed as dedicated `POST` routes
- force and approval decisions are operational actions, not inline edits
- the detail page is the main surface for reviewing attempts and approval state

## 2. Admin DTO

The UI types are defined as:
- `RenewalCycleAdminStatus`
- `RenewalAttemptAdminStatus`
- `RenewalApprovalStatus`
- `RenewalAdminSubscriptionSummary`
- `RenewalAdminOrderSummary`
- `RenewalAdminPendingChangeSummary`
- `RenewalAdminApprovalSummary`
- `RenewalAttemptAdminRecord`
- `RenewalCycleAdminListItem`
- `RenewalCycleAdminDetail`
- `RenewalCycleAdminListResponse`
- `RenewalCycleAdminDetailResponse`
- `ForceRenewalAdminRequest`
- `ApproveRenewalChangesAdminRequest`
- `RejectRenewalChangesAdminRequest`

File:
- `reorder/src/admin/types/renewal.ts`

## 3. List record shape

Minimal list record:
- `id`
- `status`
- `subscription`
- `scheduled_for`
- `last_attempt_status`
- `last_attempt_at`
- `approval`
- `generated_order`
- `updated_at`

### `subscription`

The `subscription` field groups the data required to identify the renewal target:

```ts
{
  subscription_id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  customer_name: string
  product_title: string
  variant_title: string
  sku: string | null
}
```

Why:
- the table and detail view should identify the subscription without requiring another shape
- the UI can render one consistent `subscription + commerce context` block

### `approval`

The `approval` field is a compact operational summary:

```ts
{
  status: "pending" | "approved" | "rejected" | null
  required: boolean
  decided_at: string | null
  decided_by: string | null
  reason: string | null
}
```

Why:
- the list must quickly show whether the cycle is blocked by approval
- the detail view can expand the same object without inventing another shape

### `generated_order`

The generated order summary is nullable because a cycle may not have created an order yet:

```ts
{
  order_id: string
  display_id: number | string
  status: string
} | null
```

Why:
- the queue view should link a successful cycle to its resulting order
- failed or not-yet-processed cycles should remain explicit rather than overloading placeholder strings

## 4. Detail shape

The detail DTO extends the list record with:
- `created_at`
- `processed_at`
- `last_error`
- `pending_changes`
- `attempts`
- `metadata`

The detail view should support:
- reviewing the current renewal state
- inspecting attempt history
- reviewing pending changes and approval state
- triggering operational actions from a single cycle detail page

### `pending_changes`

Pending changes are represented as a normalized preview of the subscription change that may be applied during renewal:

```ts
{
  variant_id: string
  variant_title: string
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  effective_at: string | null
} | null
```

### `attempts`

Attempts are represented as an ordered list of technical execution records:

```ts
Array<{
  id: string
  attempt_no: number
  status: "processing" | "succeeded" | "failed"
  started_at: string
  finished_at: string | null
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  order_id: string | null
}>
```

Why:
- the detail page must show an operational timeline
- retry and failure analysis should not be flattened into one top-level error field

## 5. Statuses

### 5.1 Cycle statuses

At this stage, the renewal cycle statuses are:
- `scheduled`
- `processing`
- `succeeded`
- `failed`

These statuses describe execution state, not approval state.

### 5.2 Attempt statuses

Attempt statuses are:
- `processing`
- `succeeded`
- `failed`

### 5.3 Approval statuses

Approval statuses are:
- `pending`
- `approved`
- `rejected`

If approval is not required for a cycle:
- `approval.required = false`
- `approval.status = null`

This keeps approval state explicit without overloading the cycle status machine.

## 6. `Renewals` list

The list is based on `DataTable` and should expose the following columns:

| Column | Visible by default | Sortable | Notes |
|---|---:|---:|---|
| `subscription` | yes | yes | reference + customer + product context |
| `scheduled_for` | yes | yes | target processing date |
| `status` | yes | yes | renewal cycle status badge |
| `last_attempt_status` | yes | yes | last known execution result |
| `approval` | yes | yes | pending / approved / rejected / not required |
| `generated_order` | yes | yes | order created from renewal, if any |
| `updated_at` | no | yes | technical helper column |

### Column rendering

`subscription`
- first line: subscription reference
- second line: customer name
- third line: product title + variant title or SKU when useful

`scheduled_for`
- compact formatted date and time

`status`
- `StatusBadge`

`last_attempt_status`
- compact success / failed / processing summary

`approval`
- `Pending approval`
- `Approved`
- `Rejected`
- `Not required`

`generated_order`
- display ID when available
- subtle fallback text when no order was generated

## 7. Actions

List/detail actions:

| Action | Available when | Confirm | Purpose |
|---|---|---:|---|
| `force` | `scheduled`, `failed` | yes | trigger manual renewal execution |
| `approve_changes` | approval required and `pending` | yes | allow pending changes to be applied |
| `reject_changes` | approval required and `pending` | yes | block pending changes from being applied |

Notes:
- `approve_changes` and `reject_changes` are decision actions, not generic edit actions
- `force` should stay disabled while the cycle is already `processing`
- confirmation is required because all three actions have operational consequences

## 8. Detail view fields

The detail page should expose these sections:
- cycle overview
- subscription summary
- generated order summary
- approval summary
- pending changes
- attempt history
- technical metadata

The overview should include:
- cycle status
- scheduled date
- processed date
- last error summary

The detail page is the main operational surface for:
- reviewing failures
- making approval decisions
- forcing a retry

## 9. Filters and sorting

List filters:
- `q`
- `status`
- `approval_status`
- `scheduled_from`
- `scheduled_to`
- `last_attempt_status`
- `subscription_id`
- `generated_order_id`

Filter meaning:
- `q` searches at least subscription reference, customer name, product title, variant title, and order display ID
- `status` filters cycle execution state
- `approval_status` filters approval decision state
- `scheduled_from` and `scheduled_to` narrow the queue by date range
- `last_attempt_status` filters by most recent attempt result

Sorting:
- `scheduled_for`
- `updated_at`
- `created_at`
- `status`
- `approval_status`
- `last_attempt_status`
- `processed_at`
- `subscription_reference`
- `customer_name`
- `product_title`
- `order_display_id`

List query contract:
- `limit`
- `offset`
- `order`
- `direction`
- all filters listed above

## 10. Mutation payloads

The payloads below are a specification for later steps.
Their implementation should be added to Zod validators in `src/api/admin/renewals/**/validators.ts` or middleware files following Medusa patterns.

### `force`

```json
{
  "reason": "manual operator retry after payment issue review"
}
```

Notes:
- `reason` is optional but recommended for auditability

### `approve_changes`

```json
{
  "reason": "pending plan change reviewed and approved"
}
```

Notes:
- `reason` is optional
- the decision should still be auditable through actor and timestamp

### `reject_changes`

```json
{
  "reason": "pending changes are not valid for this renewal cycle"
}
```

Notes:
- `reason` is required
- reject without a reason should be treated as invalid in later steps

## 11. Detail response contract

Renewal detail extends the list record with:
- lifecycle timestamps
- last error text
- full approval summary
- pending change preview
- attempts array
- metadata

This allows the Admin detail page to stay self-contained without requiring additional ad hoc request shapes for attempts or approval state.

## 12. Impact on later steps

This contract means the next `2.3` steps must design at least these endpoints:
- `GET /admin/renewals`
- `GET /admin/renewals/:id`
- `POST /admin/renewals/:id/force`
- `POST /admin/renewals/:id/approve-changes`
- `POST /admin/renewals/:id/reject-changes`

It also means the later read model must support:
- list-level queue rendering
- detail-level attempt history
- approval visibility
- linking a cycle to its generated renewal order
