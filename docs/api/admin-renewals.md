# Admin Renewals API

This document describes the implemented Admin API contract for the `Renewals` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request parameters
- request bodies
- response shapes
- common error scenarios

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/renewals`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- all mutations are executed through workflows rather than mutating data directly in the route handler

This keeps the API aligned with Medusa’s route and workflow conventions.

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/renewal.ts`

Main response types:
- `RenewalCycleAdminListResponse`
- `RenewalCycleAdminDetailResponse`
- `RenewalCycleAdminListItem`
- `RenewalCycleAdminDetail`
- `RenewalAttemptAdminRecord`
- `RenewalAdminApprovalSummary`

## Shared Domain Values

### Cycle Status Values

Supported renewal cycle statuses:
- `scheduled`
- `processing`
- `succeeded`
- `failed`

### Approval Status Values

Supported approval statuses:
- `pending`
- `approved`
- `rejected`

When approval is not required, the API returns `status = null` inside the approval summary.

### Attempt Status Values

Supported attempt statuses:
- `processing`
- `succeeded`
- `failed`

## 1. List Renewals

### Endpoint

- Method: `GET`
- Path: `/admin/renewals`

### Purpose

Returns the paginated renewal queue used by the Admin renewals DataTable.

### Query Parameters

Pagination and search:
- `limit?: number`
- `offset?: number`
- `q?: string`

Sorting:
- `order?: string`
- `direction?: "asc" | "desc"`

Filters:
- `status?: string | string[]`
- `approval_status?: string | string[]`
- `scheduled_from?: string`
- `scheduled_to?: string`
- `last_attempt_status?: string | string[]`
- `subscription_id?: string`
- `generated_order_id?: string`

### Supported Sort Fields

Database-backed:
- `scheduled_for`
- `updated_at`
- `created_at`
- `status`
- `approval_status`
- `processed_at`

In-memory:
- `last_attempt_status`
- `subscription_reference`
- `customer_name`
- `product_title`
- `order_display_id`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "renewals": [
    {
      "id": "re_123",
      "status": "scheduled",
      "subscription": {
        "subscription_id": "sub_123",
        "reference": "SUB-001",
        "status": "active",
        "customer_name": "Jane Doe",
        "product_title": "Coffee Subscription",
        "variant_title": "1 kg",
        "sku": "COFFEE-1KG"
      },
      "scheduled_for": "2026-04-15T10:00:00.000Z",
      "last_attempt_status": "failed",
      "last_attempt_at": "2026-04-15T10:02:00.000Z",
      "approval": {
        "required": true,
        "status": "pending",
        "decided_at": null,
        "decided_by": null,
        "reason": null
      },
      "generated_order": null,
      "updated_at": "2026-04-15T10:02:00.000Z"
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

### Common Errors

- `400 invalid_data`
  Invalid query parameter shape or unsupported query value.
- `400 invalid_data`
  Unsupported sort field.

## 2. Get Renewal Details

### Endpoint

- Method: `GET`
- Path: `/admin/renewals/:id`

### Purpose

Returns the full Admin detail payload for a single renewal cycle.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "renewal": {
    "id": "re_123",
    "status": "failed",
    "subscription": {
      "subscription_id": "sub_123",
      "reference": "SUB-001",
      "status": "active",
      "customer_name": "Jane Doe",
      "product_title": "Coffee Subscription",
      "variant_title": "1 kg",
      "sku": "COFFEE-1KG"
    },
    "scheduled_for": "2026-04-15T10:00:00.000Z",
    "last_attempt_status": "failed",
    "last_attempt_at": "2026-04-15T10:02:00.000Z",
    "approval": {
      "required": true,
      "status": "approved",
      "decided_at": "2026-04-15T09:55:00.000Z",
      "decided_by": "user_123",
      "reason": "approved for processing"
    },
    "generated_order": {
      "order_id": "order_123",
      "display_id": 1001,
      "status": "pending"
    },
    "updated_at": "2026-04-15T10:03:00.000Z",
    "created_at": "2026-04-10T10:00:00.000Z",
    "processed_at": "2026-04-15T10:03:00.000Z",
    "last_error": null,
    "pending_changes": {
      "variant_id": "variant_456",
      "variant_title": "2 kg",
      "frequency_interval": "month",
      "frequency_value": 2,
      "effective_at": null
    },
    "attempts": [
      {
        "id": "reatt_123",
        "attempt_no": 1,
        "status": "failed",
        "started_at": "2026-04-15T10:00:00.000Z",
        "finished_at": "2026-04-15T10:02:00.000Z",
        "error_code": "renewal_failed",
        "error_message": "payment failed",
        "payment_reference": null,
        "order_id": null
      }
    ],
    "metadata": {
      "last_trigger_type": "manual",
      "last_correlation_id": "renewal-admin-force-uuid"
    }
  }
}
```

### Common Errors

- `404 not_found`
  The renewal cycle does not exist.

## 3. Force Renewal

### Endpoint

- Method: `POST`
- Path: `/admin/renewals/:id/force`

### Purpose

Manually triggers execution for a renewal cycle that is allowed to be force-run.

### Request Body

```json
{
  "reason": "manual retry after review"
}
```

Fields:
- `reason?: string`

### Success Response

Status:
- `200 OK`

Returns the refreshed renewal detail payload:

```json
{
  "renewal": {
    "id": "re_123",
    "status": "succeeded"
  }
}
```

### Common Errors

- `404 not_found`
  The renewal cycle does not exist.
- `409 conflict`
  The cycle is already processing.
- `409 conflict`
  Duplicate execution is blocked because the cycle already succeeded.
- `409 conflict`
  The cycle is not in a forceable state.
- `409 conflict`
  The cycle requires approved changes before it can be force-run.
- `409 conflict`
  The linked subscription is not eligible for renewal.
- `400 invalid_data`
  Current `Plans & Offers` policy blocks the pending change being applied.

## 4. Approve Renewal Changes

### Endpoint

- Method: `POST`
- Path: `/admin/renewals/:id/approve-changes`

### Purpose

Approves pending subscription changes for a renewal cycle that requires approval.

### Request Body

```json
{
  "reason": "approved after review"
}
```

Fields:
- `reason?: string`

### Success Response

Status:
- `200 OK`

Returns the refreshed renewal detail payload with updated approval summary.

### Common Errors

- `404 not_found`
  The renewal cycle does not exist.
- `409 conflict`
  Approval is not required for this cycle.
- `409 conflict`
  Approval was already decided for this cycle.

## 5. Reject Renewal Changes

### Endpoint

- Method: `POST`
- Path: `/admin/renewals/:id/reject-changes`

### Purpose

Rejects pending subscription changes for a renewal cycle that requires approval.

### Request Body

```json
{
  "reason": "pending changes are not valid for this cycle"
}
```

Fields:
- `reason: string`

Unlike approval, `reason` is required in the current API contract.

### Success Response

Status:
- `200 OK`

Returns the refreshed renewal detail payload with updated approval summary.

### Common Errors

- `400 invalid_data`
  Missing or invalid `reason`.
- `404 not_found`
  The renewal cycle does not exist.
- `409 conflict`
  Approval is not required for this cycle.
- `409 conflict`
  Approval was already decided for this cycle.

## 6. API Notes

### Read Model Notes

The renewal Admin API uses dedicated read-model helpers rather than returning raw module entities.

This means the payloads already include:
- linked subscription summary
- linked order summary
- approval summary
- latest attempt summary on list
- full attempt history on detail

### Operational Notes

The current implementation also attaches operational metadata during execution, including trigger information and correlation IDs used for logging and scheduler tracing.

These fields are exposed through `metadata` on the detail response.

The Admin consumers of this API are implemented in:
- `src/admin/routes/subscriptions/renewals/page.tsx`
- `src/admin/routes/subscriptions/renewals/[id]/page.tsx`

The corresponding data-loading and invalidation layer is centralized in:
- `src/admin/routes/subscriptions/renewals/data-loading.ts`

## Related Documents

- [Renewals Architecture](../architecture/renewals.md)
- [Admin Renewals UI](../admin/renewals.md)
- [Renewals Testing](../testing/renewals.md)
- [Renewals Specs](../specs/renewals/admin-spec.md)
