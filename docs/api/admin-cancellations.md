# Admin Cancellations API

This document describes the implemented Admin API contract for the `Cancellation & Retention` area of the `Reorder` plugin.

It is the current runtime source of truth for:
- request parameters
- request bodies
- response shapes
- common error scenarios

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/cancellations`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- all mutations are executed through workflows rather than mutating data directly in the route handler

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/cancellation.ts`

Main response types:
- `CancellationCaseAdminListResponse`
- `CancellationCaseAdminDetailResponse`
- `CancellationCaseAdminListItem`
- `CancellationCaseAdminDetail`
- `CancellationAdminOfferEventRecord`
- `CancellationAdminSubscriptionSummary`
- `CancellationAdminDunningSummary`
- `CancellationAdminRenewalSummary`

## Shared Domain Values

### Case Status Values

Supported cancellation case statuses:
- `requested`
- `evaluating_retention`
- `retention_offered`
- `retained`
- `paused`
- `canceled`

### Final Outcome Values

Supported final outcomes:
- `retained`
- `paused`
- `canceled`

### Recommended Action Values

Supported recommendation values:
- `pause_offer`
- `discount_offer`
- `bonus_offer`
- `direct_cancel`

### Offer Decision Status Values

Supported retention offer decision statuses:
- `proposed`
- `accepted`
- `rejected`
- `applied`
- `expired`

### Reason Category Values

Supported reason categories:
- `price`
- `product_fit`
- `delivery`
- `billing`
- `temporary_pause`
- `switched_competitor`
- `other`

## 1. List Cancellation Cases

### Endpoint

- Method: `GET`
- Path: `/admin/cancellations`

### Purpose

Returns the paginated cancellation queue used by the Admin `Cancellation & Retention` DataTable.

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
- `final_outcome?: string | string[]`
- `reason_category?: string | string[]`
- `offer_type?: string | string[]`
- `subscription_id?: string`
- `created_from?: string`
- `created_to?: string`

### Supported Sort Fields

Database-backed:
- `created_at`
- `updated_at`
- `status`
- `final_outcome`
- `reason_category`
- `finalized_at`

In-memory:
- `subscription_reference`
- `customer_name`
- `product_title`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "cancellations": [
    {
      "id": "cc_123",
      "status": "evaluating_retention",
      "reason": "Customer says the price is too high",
      "reason_category": "price",
      "recommended_action": "discount_offer",
      "final_outcome": null,
      "subscription": {
        "subscription_id": "sub_123",
        "reference": "SUB-001",
        "status": "active",
        "customer_name": "Jane Doe",
        "product_title": "Coffee Subscription",
        "variant_title": "1 kg",
        "sku": "COFFEE-1KG",
        "next_renewal_at": "2026-04-15T10:00:00.000Z",
        "last_renewal_at": "2026-03-15T10:00:00.000Z",
        "paused_at": null,
        "cancelled_at": null,
        "cancel_effective_at": null
      },
      "created_at": "2026-04-01T10:00:00.000Z",
      "finalized_at": null,
      "updated_at": "2026-04-01T10:05:00.000Z"
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

## 2. Get Cancellation Case Details

### Endpoint

- Method: `GET`
- Path: `/admin/cancellations/:id`

### Purpose

Returns the full Admin detail payload for a single cancellation case.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "cancellation": {
    "id": "cc_123",
    "status": "retained",
    "reason": "Customer asked for a lower price",
    "reason_category": "price",
    "recommended_action": "discount_offer",
    "final_outcome": "retained",
    "subscription": {
      "subscription_id": "sub_123",
      "reference": "SUB-001",
      "status": "active",
      "customer_name": "Jane Doe",
      "product_title": "Coffee Subscription",
      "variant_title": "1 kg",
      "sku": "COFFEE-1KG",
      "next_renewal_at": "2026-04-15T10:00:00.000Z",
      "last_renewal_at": "2026-03-15T10:00:00.000Z",
      "paused_at": null,
      "cancelled_at": null,
      "cancel_effective_at": null
    },
    "created_at": "2026-04-01T10:00:00.000Z",
    "finalized_at": "2026-04-01T10:20:00.000Z",
    "updated_at": "2026-04-01T10:20:00.000Z",
    "notes": "Customer accepted a temporary retention discount",
    "finalized_by": "user_123",
    "cancellation_effective_at": null,
    "dunning": null,
    "renewal": {
      "renewal_cycle_id": "re_123",
      "status": "scheduled",
      "scheduled_for": "2026-04-15T10:00:00.000Z",
      "approval_status": null,
      "generated_order_id": null
    },
    "offers": [
      {
        "id": "roe_123",
        "offer_type": "discount_offer",
        "offer_payload": {
          "discount_offer": {
            "discount_type": "percentage",
            "discount_value": 10,
            "duration_cycles": 2,
            "note": null
          }
        },
        "decision_status": "applied",
        "decision_reason": "Customer accepted the offer",
        "decided_at": "2026-04-01T10:15:00.000Z",
        "decided_by": "user_123",
        "applied_at": "2026-04-01T10:15:00.000Z",
        "metadata": null,
        "created_at": "2026-04-01T10:15:00.000Z",
        "updated_at": "2026-04-01T10:15:00.000Z"
      }
    ],
    "metadata": {
      "manual_actions": []
    }
  }
}
```

### Common Errors

- `404 not_found`
  The cancellation case does not exist.

## 3. Smart Cancel

### Endpoint

- Method: `POST`
- Path: `/admin/cancellations/:id/smart-cancel`

### Purpose

Evaluates the active case and stores a recommendation for retention versus direct cancellation.

### Request Body

All fields are optional.

```json
{
  "evaluated_by": "user_123",
  "metadata": {
    "source": "admin"
  }
}
```

### Success Response

Status:
- `200 OK`

Shape:
- same as `GET /admin/cancellations/:id`

### Common Errors

- `404 not_found`
  Case does not exist.
- `409 invalid_state`
  Case is terminal or not eligible for recommendation.

## 4. Apply Retention Offer

### Endpoint

- Method: `POST`
- Path: `/admin/cancellations/:id/apply-offer`

### Purpose

Applies a concrete retention action, creates a `RetentionOfferEvent`, updates the subscription, and closes the case as `retained` or `paused`.

### Request Body

Supported payloads:

#### Pause Offer

```json
{
  "offer_type": "pause_offer",
  "offer_payload": {
    "pause_offer": {
      "pause_cycles": 2,
      "resume_at": null,
      "note": "Customer wants a short break"
    }
  },
  "decided_by": "user_123",
  "decision_reason": "Pause accepted by customer"
}
```

#### Discount Offer

```json
{
  "offer_type": "discount_offer",
  "offer_payload": {
    "discount_offer": {
      "discount_type": "percentage",
      "discount_value": 10,
      "duration_cycles": 2,
      "note": "Temporary save offer"
    }
  },
  "decided_by": "user_123",
  "decision_reason": "Customer accepted a lower price"
}
```

#### Bonus Offer

```json
{
  "offer_type": "bonus_offer",
  "offer_payload": {
    "bonus_offer": {
      "bonus_type": "free_cycle",
      "value": 1,
      "label": null,
      "duration_cycles": 1,
      "note": null
    }
  },
  "decided_by": "user_123",
  "decision_reason": "Customer accepted a free cycle"
}
```

### Validation Notes

Current API validation enforces:
- `pause_offer` requires `pause_cycles` or `resume_at`
- percentage discounts cannot exceed `50`
- `discount_value` must be positive
- `duration_cycles` must be positive when provided
- `bonus_offer` values must be non-negative
- `free_cycle` and `credit` require `value`

### Success Response

Status:
- `200 OK`

Shape:
- same as `GET /admin/cancellations/:id`

### Common Errors

- `404 not_found`
  Case does not exist.
- `409 invalid_state`
  Case is terminal or cannot accept a new offer.
- `409 offer_out_of_policy`
  Offer payload violates retention policy rules.

## 5. Finalize Cancellation

### Endpoint

- Method: `POST`
- Path: `/admin/cancellations/:id/finalize`

### Purpose

Finalizes the case as `canceled`, updates the subscription lifecycle, computes `cancel_effective_at`, and clears renewal eligibility.

### Request Body

```json
{
  "reason": "Customer is switching to another provider",
  "reason_category": "switched_competitor",
  "notes": "No retention offer accepted",
  "finalized_by": "user_123",
  "effective_at": "immediately"
}
```

### Notes

- `reason` is required by domain rules for final cancellation.
- If omitted in the body, the workflow may use the existing case reason.
- `effective_at` supports:
  - `immediately`
  - `end_of_cycle`

### Success Response

Status:
- `200 OK`

Shape:
- same as `GET /admin/cancellations/:id`

### Common Errors

- `404 not_found`
  Case does not exist.
- `409 invalid_state`
  Case is terminal or not eligible for final cancel.
- `400 invalid_data`
  Reason is missing after resolving body and existing case data.

## 6. Update Cancellation Reason

### Endpoint

- Method: `POST`
- Path: `/admin/cancellations/:id/reason`

### Purpose

Updates the churn reason, normalized reason category, and notes for the case.

### Request Body

```json
{
  "reason": "The subscription no longer fits the customer needs",
  "reason_category": "product_fit",
  "notes": "Customer wants to stop after current cycle",
  "updated_by": "user_123",
  "update_reason": "Operator clarified churn classification"
}
```

### Success Response

Status:
- `200 OK`

Shape:
- same as `GET /admin/cancellations/:id`

### Common Errors

- `404 not_found`
  Case does not exist.
- `409 invalid_state`
  Case is terminal or cannot be edited.

## 7. Common Domain Error Scenarios

Across the mutation routes, the current runtime exposes domain-aware errors for:

- `duplicate_active_case`
  More than one active case exists for the same subscription.
- `invalid_state`
  The requested mutation is not legal for the current case state.
- `already_finalized`
  The case is already terminal.
- `offer_out_of_policy`
  The requested retention offer violates policy.
- `not_found`
  Case or linked source record does not exist.

Routes map these to HTTP responses through shared error helpers in:
- `src/api/admin/cancellations/utils.ts`
