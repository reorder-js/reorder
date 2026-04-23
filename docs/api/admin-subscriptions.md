# Admin Subscriptions API

This document describes the implemented Admin API contract for the `Subscriptions` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request parameters
- request bodies
- response shapes
- common error scenarios

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/subscriptions`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/subscription.ts`

Main response types:
- `SubscriptionAdminListResponse`
- `SubscriptionAdminDetailResponse`

## Status Values

Supported subscription statuses:
- `active`
- `paused`
- `cancelled`
- `past_due`

## 1. List Subscriptions

### Endpoint

- Method: `GET`
- Path: `/admin/subscriptions`

### Purpose

Returns the paginated list used by the Admin subscriptions DataTable.

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
- `customer_id?: string`
- `product_id?: string`
- `variant_id?: string`
- `next_renewal_from?: string`
- `next_renewal_to?: string`
- `is_trial?: boolean`
- `skip_next_cycle?: boolean`

### Supported Sort Fields

Database-backed:
- `created_at`
- `updated_at`
- `status`
- `frequency_interval`
- `frequency_value`
- `next_renewal_at`
- `trial_ends_at`
- `skip_next_cycle`

In-memory:
- `customer_name`
- `customer_email`
- `product_title`
- `variant_title`
- `discount_value`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscriptions": [
    {
      "id": "sub_123",
      "reference": "SUB-001",
      "status": "active",
      "customer": {
        "id": "cus_123",
        "full_name": "Jane Doe",
        "email": "jane@example.com"
      },
      "product": {
        "product_id": "prod_123",
        "product_title": "Coffee Subscription",
        "variant_id": "variant_123",
        "variant_title": "1 kg",
        "sku": "COFFEE-1KG"
      },
      "frequency": {
        "interval": "month",
        "value": 1,
        "label": "Every month"
      },
      "next_renewal_at": "2026-04-15T10:00:00.000Z",
      "effective_next_renewal_at": "2026-04-15T10:00:00.000Z",
      "trial": {
        "is_trial": false,
        "trial_ends_at": null
      },
      "discount": {
        "type": "percentage",
        "value": 10,
        "label": "10% off"
      },
      "skip_next_cycle": false,
      "updated_at": "2026-03-28T12:00:00.000Z"
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

## 2. Get Subscription Details

### Endpoint

- Method: `GET`
- Path: `/admin/subscriptions/:id`

### Purpose

Returns the full Admin detail payload for a single subscription.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscription": {
    "id": "sub_123",
    "reference": "SUB-001",
    "status": "active",
    "customer": {
      "id": "cus_123",
      "full_name": "Jane Doe",
      "email": "jane@example.com"
    },
    "product": {
      "product_id": "prod_123",
      "product_title": "Coffee Subscription",
      "variant_id": "variant_123",
      "variant_title": "1 kg",
      "sku": "COFFEE-1KG"
    },
    "frequency": {
      "interval": "month",
      "value": 1,
      "label": "Every month"
    },
    "next_renewal_at": "2026-04-15T10:00:00.000Z",
    "effective_next_renewal_at": "2026-04-15T10:00:00.000Z",
    "trial": {
      "is_trial": false,
      "trial_ends_at": null
    },
    "discount": {
      "type": "percentage",
      "value": 10,
      "label": "10% off"
    },
    "skip_next_cycle": false,
    "updated_at": "2026-03-28T12:00:00.000Z",
    "created_at": "2026-03-01T10:00:00.000Z",
    "started_at": "2026-03-01T10:00:00.000Z",
    "paused_at": null,
    "cancelled_at": null,
    "last_renewal_at": "2026-03-15T10:00:00.000Z",
    "shipping_address": {
      "first_name": "Jane",
      "last_name": "Doe",
      "company": null,
      "address_1": "Main Street 1",
      "address_2": null,
      "city": "Warsaw",
      "postal_code": "00-001",
      "province": "Mazowieckie",
      "country_code": "PL",
      "phone": "+48123123123"
    },
    "pending_update_data": {
      "variant_id": "variant_456",
      "variant_title": "2 kg",
      "frequency_interval": "month",
      "frequency_value": 2,
      "effective_at": "2026-05-01T00:00:00.000Z"
    }
  }
}
```

Notes:
- `next_renewal_at` remains the technical billing anchor used by renewals
- `effective_next_renewal_at` is the projected next renewal date shown in Admin when `skip_next_cycle` is enabled

### Common Errors

- `404 not_found`
  Subscription does not exist.

## 2.1 Order Detail Subscription Summary

### Endpoint

- Method: `GET`
- Path: `/admin/orders/:id/subscription-summary`

### Purpose

Returns the lightweight subscription context used by the custom `Subscription` widget on the Medusa order detail page.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape when the order is linked to a subscription:

```json
{
  "summary": {
    "is_subscription_order": true,
    "subscription": {
      "id": "sub_123",
      "reference": "SUB-001",
      "status": "active",
      "frequency_label": "Every 2 weeks",
      "discount": {
        "type": "percentage",
        "value": 5,
        "label": "5% off"
      },
      "next_renewal_at": "2026-05-07T10:00:00.000Z",
      "effective_next_renewal_at": "2026-05-07T10:00:00.000Z"
    }
  }
}
```

Shape when the order is not linked to a subscription:

```json
{
  "summary": {
    "is_subscription_order": false,
    "subscription": null
  }
}
```

Notes:
- `discount` is derived from the subscription `pricing_snapshot`
- this route is read-only and intentionally smaller than the full subscription detail response

## 3. Pause Subscription

### Endpoint

- Method: `POST`
- Path: `/admin/subscriptions/:id/pause`

### Purpose

Pauses an active subscription.

### Request Body

All fields are optional.

```json
{
  "reason": "customer requested temporary stop",
  "effective_at": "2026-04-01T00:00:00.000Z"
}
```

Validation:
- `reason?: string`
- `effective_at?: ISO datetime string`

### Success Response

Status:
- `200 OK`

Response:
- full `SubscriptionAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid body payload.
- `404 not_found`
  Subscription does not exist.
- `409 conflict`
  Subscription cannot be paused from its current state.

## 4. Resume Subscription

### Endpoint

- Method: `POST`
- Path: `/admin/subscriptions/:id/resume`

### Purpose

Resumes a paused subscription.

### Request Body

All fields are optional.

```json
{
  "resume_at": "2026-04-15T00:00:00.000Z",
  "preserve_billing_anchor": true
}
```

Validation:
- `resume_at?: ISO datetime string`
- `preserve_billing_anchor?: boolean`

### Success Response

Status:
- `200 OK`

Response:
- full `SubscriptionAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid body payload.
- `404 not_found`
  Subscription does not exist.
- `409 conflict`
  Subscription cannot be resumed from its current state.

## 5. Cancel Subscription

### Endpoint

- Method: `POST`
- Path: `/admin/subscriptions/:id/cancel`

### Purpose

Cancels a subscription.

### Request Body

All fields are optional.

```json
{
  "reason": "retention flow failed",
  "effective_at": "end_of_cycle"
}
```

Validation:
- `reason?: string`
- `effective_at?: "immediately" | "end_of_cycle"`

### Success Response

Status:
- `200 OK`

Response:
- full `SubscriptionAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid body payload.
- `404 not_found`
  Subscription does not exist.
- `409 conflict`
  Subscription cannot be cancelled from its current state.

## 6. Schedule Plan Change

### Endpoint

- Method: `POST`
- Path: `/admin/subscriptions/:id/schedule-plan-change`

### Purpose

Stores a future plan or cadence update in `pending_update_data`.

### Request Body

```json
{
  "variant_id": "variant_456",
  "frequency_interval": "month",
  "frequency_value": 2,
  "effective_at": "2026-05-01T00:00:00.000Z"
}
```

Validation:
- `variant_id: string`
- `frequency_interval: "week" | "month" | "year"`
- `frequency_value: positive integer`
- `effective_at?: ISO datetime string`

### Success Response

Status:
- `200 OK`

Response:
- full `SubscriptionAdminDetailResponse`

Important behavior:
- `pending_update_data` is returned as part of the refreshed subscription detail payload
- `requested_by` is captured internally from the authenticated admin actor, but it is not exposed in the Admin DTO response

### Common Errors

- `400 invalid_data`
  Invalid body payload.
- `404 not_found`
  Subscription does not exist.
- `409 conflict`
  Plan change is not allowed for the current subscription state.

## 7. Update Shipping Address

### Endpoint

- Method: `POST`
- Path: `/admin/subscriptions/:id/update-shipping-address`

### Purpose

Updates the subscription shipping address snapshot used by Admin and future operational flows.

### Request Body

```json
{
  "first_name": "Anna",
  "last_name": "Nowak",
  "company": "ACME",
  "address_1": "Nowa 2",
  "address_2": "lok. 4",
  "city": "Krakow",
  "postal_code": "30-001",
  "province": "Malopolskie",
  "country_code": "PL",
  "phone": "+48111111111"
}
```

Validation:
- `first_name: string`
- `last_name: string`
- `company?: string | null`
- `address_1: string`
- `address_2?: string | null`
- `city: string`
- `postal_code: string`
- `province?: string | null`
- `country_code: 2-letter string`
- `phone?: string | null`

### Success Response

Status:
- `200 OK`

Response:
- full `SubscriptionAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid body payload.
- `404 not_found`
  Subscription does not exist.

## Notes for Consumers

- Mutation routes always return the refreshed subscription detail payload rather than a minimal success flag.
- The Admin UI uses these responses directly to refresh the detail view after mutations.
- The list endpoint is the source of truth for DataTable pagination, filtering, sorting, and search.
