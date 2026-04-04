# Admin Activity Log API

This document describes the implemented Admin API contract for the `Activity Log` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request parameters
- response shapes
- filtering, sorting, and pagination rules
- common error scenarios

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Paths

Implemented routes:
- `/admin/subscription-logs`
- `/admin/subscription-logs/:id`
- `/admin/subscriptions/:id/logs`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- route handlers stay thin and delegate read logic to query helpers

This keeps the API aligned with Medusa route and Admin read-model conventions.

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/activity-log.ts`

Main response types:
- `ActivityLogAdminListResponse`
- `ActivityLogAdminDetailResponse`
- `ActivityLogAdminListItem`
- `ActivityLogAdminDetail`
- `ActivityLogAdminSubscriptionSummary`

## Shared Domain Values

### Actor Type Values

Supported actor values:
- `user`
- `system`
- `scheduler`

### Event Type Values

Supported event groups:
- `subscription.*`
- `renewal.*`
- `dunning.*`
- `cancellation.*`

The current explicit event taxonomy is defined in:
- `docs/architecture/activity-log.md`

## 1. List Activity Log Events

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-logs`

### Purpose

Returns the paginated global activity-log list used by the Admin `Activity Log` DataTable.

### Query Parameters

Pagination and search:
- `limit?: number`
- `offset?: number`
- `q?: string`

Sorting:
- `order?: string`
- `direction?: "asc" | "desc"`

Filters:
- `subscription_id?: string`
- `customer_id?: string`
- `event_type?: string | string[]`
- `actor_type?: string | string[]`
- `date_from?: string`
- `date_to?: string`

### Supported Sort Fields

Database-backed:
- `created_at`
- `event_type`
- `actor_type`

In-memory:
- `subscription_reference`
- `customer_name`
- `reason`

### Default Sort

If no explicit sort is passed, the list is returned using:
- `created_at desc`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscription_logs": [
    {
      "id": "slog_123",
      "subscription_id": "sub_123",
      "event_type": "subscription.paused",
      "actor_type": "user",
      "actor_id": "user_123",
      "actor": {
        "type": "user",
        "id": "user_123",
        "email": "admin@example.com",
        "name": "Admin User",
        "display": "admin@example.com"
      },
      "subscription": {
        "subscription_id": "sub_123",
        "reference": "SUB-001",
        "customer_id": "cus_123",
        "customer_name": "Jane Doe",
        "product_title": "Coffee Subscription",
        "variant_title": "1 kg"
      },
      "reason": "customer requested pause",
      "change_summary": "status, paused_at",
      "created_at": "2026-04-15T10:00:00.000Z"
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

### Common Errors

- `400 invalid_data`
  Invalid query parameter shape or unsupported sort field.

## 2. Get Activity Log Detail

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-logs/:id`

### Purpose

Returns the full detail payload for one `subscription_log` event.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscription_log": {
    "id": "slog_123",
    "subscription_id": "sub_123",
    "event_type": "renewal.succeeded",
    "actor_type": "scheduler",
    "actor_id": null,
    "actor": {
      "type": "scheduler",
      "id": null,
      "email": null,
      "name": null,
      "display": null
    },
    "subscription": {
      "subscription_id": "sub_123",
      "reference": "SUB-001",
      "customer_id": "cus_123",
      "customer_name": "Jane Doe",
      "product_title": "Coffee Subscription",
      "variant_title": "1 kg"
    },
    "reason": null,
    "change_summary": "status, processed_at",
    "created_at": "2026-04-15T10:03:00.000Z",
    "previous_state": {
      "status": "scheduled"
    },
    "new_state": {
      "status": "succeeded"
    },
    "changed_fields": [
      {
        "field": "status",
        "before": "scheduled",
        "after": "succeeded"
      }
    ],
    "metadata": {
      "renewal_cycle_id": "re_123",
      "order_id": "order_123"
    }
  }
}
```

### Common Errors

- `404 not_found`
  The activity log record does not exist.

## 3. Get Timeline for One Subscription

### Endpoint

- Method: `GET`
- Path: `/admin/subscriptions/:id/logs`

### Purpose

Returns the paginated activity-log timeline for one subscription detail page.

### Path Parameters

- `id: string`

### Query Parameters

Supports the same pagination, sorting, and filter fields as the global list.

In practice, the route applies the same read model while forcing:
- `subscription_id = :id`

### Default Sort

If no explicit sort is passed, the timeline is returned using:
- `created_at desc`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscription_logs": [
    {
      "id": "slog_123",
      "subscription_id": "sub_123",
      "event_type": "subscription.paused",
      "actor_type": "user",
      "actor_id": "user_123",
      "subscription": {
        "subscription_id": "sub_123",
        "reference": "SUB-001",
        "customer_id": "cus_123",
        "customer_name": "Jane Doe",
        "product_title": "Coffee Subscription",
        "variant_title": "1 kg"
      },
      "reason": "customer requested pause",
      "change_summary": "status, paused_at",
      "created_at": "2026-04-15T10:00:00.000Z"
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

## Read Model Notes

The implemented read model is snapshot-first.

This means:
- the list and timeline render from `subscription_log` snapshots
- the detail view returns the stored event payload from the same record
- the API does not require heavy runtime enrichment from linked modules for the base experience

This keeps the audit trail historically stable and operationally predictable.
