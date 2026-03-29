# Admin Plans & Offers API

This document describes the implemented Admin API contract for the `Plans & Offers` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request parameters
- request bodies
- response shapes
- common error scenarios

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/subscription-offers`

## Authentication

All routes are Admin-only routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- all mutations are executed through workflows rather than mutating data directly in the route handler

This keeps the API aligned with Medusa’s route and workflow conventions.

## Shared DTOs

The API responses are based on the Admin DTOs defined in:

- `src/admin/types/plan-offer.ts`

Main response types:
- `PlanOfferAdminListResponse`
- `PlanOfferAdminDetailResponse`
- `PlanOfferAdminListItem`
- `PlanOfferAdminDetail`
- `PlanOfferAdminEffectiveConfigSummary`

## Shared Domain Values

### Status Values

Supported admin statuses:
- `enabled`
- `disabled`

### Scope Values

Supported target scopes:
- `product`
- `variant`

### Frequency Values

Supported frequency intervals:
- `week`
- `month`
- `year`

### Discount Values

Supported discount types:
- `percentage`
- `fixed`

### Rule Values

Supported stacking policies:
- `allowed`
- `disallow_all`
- `disallow_subscription_discounts`

## 1. List Plan Offers

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-offers`

### Purpose

Returns the paginated list used by the Admin plans and offers DataTable.

### Query Parameters

Pagination and search:
- `limit?: number`
- `offset?: number`
- `q?: string`

Sorting:
- `order?: string`
- `direction?: "asc" | "desc"`

Filters:
- `is_enabled?: boolean`
- `scope?: "product" | "variant"`
- `product_id?: string`
- `variant_id?: string`
- `frequency?: "week" | "month" | "year"`
- `discount_min?: number`
- `discount_max?: number`

### Supported Sort Fields

Database-backed:
- `name`
- `scope`
- `is_enabled`
- `created_at`
- `updated_at`

In-memory:
- `status`
- `product_title`
- `variant_title`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "plan_offers": [
    {
      "id": "po_123",
      "name": "Coffee Monthly Variant Offer",
      "status": "enabled",
      "is_enabled": true,
      "target": {
        "scope": "variant",
        "product_id": "prod_123",
        "product_title": "Coffee Subscription",
        "variant_id": "variant_123",
        "variant_title": "1 kg",
        "sku": "COFFEE-1KG"
      },
      "allowed_frequencies": [
        {
          "interval": "month",
          "value": 1,
          "label": "Every month"
        }
      ],
      "discounts": [
        {
          "interval": "month",
          "frequency_value": 1,
          "type": "percentage",
          "value": 10,
          "label": "10% off"
        }
      ],
      "rules_summary": "Min 1 cycles · Stacking allowed",
      "effective_config_summary": {
        "source_scope": "variant",
        "source_offer_id": "po_123",
        "allowed_frequencies": [
          {
            "interval": "month",
            "value": 1,
            "label": "Every month"
          }
        ],
        "discounts": [
          {
            "interval": "month",
            "frequency_value": 1,
            "type": "percentage",
            "value": 10,
            "label": "10% off"
          }
        ],
        "rules": {
          "minimum_cycles": 1,
          "trial_enabled": false,
          "trial_days": null,
          "stacking_policy": "allowed"
        }
      },
      "updated_at": "2026-03-29T12:00:00.000Z"
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

## 2. Get Plan Offer Details

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-offers/:id`

### Purpose

Returns the full Admin detail payload for a single plan offer source record.

### Path Parameters

- `id: string`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "plan_offer": {
    "id": "po_123",
    "name": "Coffee Monthly Variant Offer",
    "status": "enabled",
    "is_enabled": true,
    "target": {
      "scope": "variant",
      "product_id": "prod_123",
      "product_title": "Coffee Subscription",
      "variant_id": "variant_123",
      "variant_title": "1 kg",
      "sku": "COFFEE-1KG"
    },
    "allowed_frequencies": [
      {
        "interval": "month",
        "value": 1,
        "label": "Every month"
      }
    ],
    "discounts": [
      {
        "interval": "month",
        "frequency_value": 1,
        "type": "percentage",
        "value": 10,
        "label": "10% off"
      }
    ],
    "rules_summary": "Min 1 cycles · Stacking allowed",
    "effective_config_summary": {
      "source_scope": "variant",
      "source_offer_id": "po_123",
      "allowed_frequencies": [
        {
          "interval": "month",
          "value": 1,
          "label": "Every month"
        }
      ],
      "discounts": [
        {
          "interval": "month",
          "frequency_value": 1,
          "type": "percentage",
          "value": 10,
          "label": "10% off"
        }
      ],
      "rules": {
        "minimum_cycles": 1,
        "trial_enabled": false,
        "trial_days": null,
        "stacking_policy": "allowed"
      }
    },
    "created_at": "2026-03-29T10:00:00.000Z",
    "updated_at": "2026-03-29T12:00:00.000Z",
    "rules": {
      "minimum_cycles": 1,
      "trial_enabled": false,
      "trial_days": null,
      "stacking_policy": "allowed"
    },
    "metadata": {
      "source": "admin"
    }
  }
}
```

### Common Errors

- `404 not_found`
  Plan offer does not exist.

## 3. Create Plan Offer

### Endpoint

- Method: `POST`
- Path: `/admin/subscription-offers`

### Purpose

Creates a new plan offer or updates an existing one for the same target, depending on current state.

The mutation is workflow-backed and returns the refreshed detail payload.

This endpoint currently behaves as a create-or-upsert mutation:
- if no source record exists for the target, a new `PlanOffer` is created
- if a source record already exists for the same target, that record is updated in place

### Request Body

```json
{
  "name": "Coffee Monthly Variant Offer",
  "scope": "variant",
  "product_id": "prod_123",
  "variant_id": "variant_123",
  "is_enabled": true,
  "allowed_frequencies": [
    {
      "interval": "month",
      "value": 1
    }
  ],
  "discounts": [
    {
      "interval": "month",
      "frequency_value": 1,
      "type": "percentage",
      "value": 10
    }
  ],
  "rules": {
    "minimum_cycles": 1,
    "trial_enabled": false,
    "trial_days": null,
    "stacking_policy": "allowed"
  },
  "metadata": {
    "source": "admin"
  }
}
```

### Field Rules

- `name` is required and trimmed.
- `scope` is required and must be `product` or `variant`.
- `product_id` is required.
- `variant_id`:
  - must be omitted or `null` for product-scoped offers
  - is required for variant-scoped offers
- `is_enabled` is required.
- `allowed_frequencies` must contain at least one positive integer cadence.
- `discounts` are optional.
- `rules` are optional.
- `metadata` is optional.

### Success Response

Status:
- `200 OK`

Response shape:
- `PlanOfferAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid request shape.
- `400 invalid_data`
  Product-scoped offer specifies `variant_id`.
- `400 invalid_data`
  Variant-scoped offer omits `variant_id`.
- `400 invalid_data`
  Product does not exist.
- `400 invalid_data`
  Variant does not belong to product.
- `400 invalid_data`
  Duplicate or invalid frequency definitions.
- `400 invalid_data`
  Discount defined for a frequency not present in `allowed_frequencies`.
- `400 invalid_data`
  Invalid discount range.
- `400 invalid_data`
  Invalid trial configuration.
- `409 conflict`
  Conflicting override configuration caused by an inconsistent persisted state, such as multiple source records for one target.

## 4. Update Plan Offer

### Endpoint

- Method: `POST`
- Path: `/admin/subscription-offers/:id`

### Purpose

Updates an existing plan offer source record.

The mutation is workflow-backed and returns the refreshed detail payload.

### Path Parameters

- `id: string`

### Request Body

All fields are optional, but at least one field must be provided.

```json
{
  "name": "Coffee Monthly Variant Offer Updated",
  "is_enabled": true,
  "allowed_frequencies": [
    {
      "interval": "month",
      "value": 2
    },
    {
      "interval": "year",
      "value": 1
    }
  ],
  "discounts": [
    {
      "interval": "month",
      "frequency_value": 2,
      "type": "percentage",
      "value": 12
    }
  ],
  "rules": {
    "minimum_cycles": 2,
    "trial_enabled": true,
    "trial_days": 14,
    "stacking_policy": "disallow_subscription_discounts"
  },
  "metadata": {
    "revision": 2
  }
}
```

### Success Response

Status:
- `200 OK`

Response shape:
- `PlanOfferAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Empty body with no fields to update.
- `400 invalid_data`
  Invalid request shape.
- `400 invalid_data`
  Invalid frequency, discount, or rules configuration.
- `404 not_found`
  Plan offer does not exist.

## 5. Toggle Plan Offer

### Endpoint

- Method: `POST`
- Path: `/admin/subscription-offers/:id/toggle`

### Purpose

Enables or disables an existing plan offer without updating its other fields.

The mutation is workflow-backed and returns the refreshed detail payload.

### Path Parameters

- `id: string`

### Request Body

```json
{
  "is_enabled": false
}
```

### Success Response

Status:
- `200 OK`

Response shape:
- `PlanOfferAdminDetailResponse`

### Common Errors

- `400 invalid_data`
  Invalid request shape.
- `404 not_found`
  Plan offer does not exist.

## 6. Domain Rules and Common Errors

The `Plans & Offers` API enforces several domain rules beyond basic request validation.

### Target Rules

- a product-scoped offer cannot specify `variant_id`
- a variant-scoped offer must specify `variant_id`
- the variant must belong to the selected product
- the target product must exist

### Frequency Rules

- `allowed_frequencies` must not be empty
- each frequency must use a positive integer value
- duplicate `interval:value` combinations are rejected

### Discount Rules

- discounts can only be defined for allowed frequencies
- duplicate discounts for the same frequency are rejected
- percentage discounts must be greater than `0` and at most `100`
- fixed discounts must be greater than `0`

### Rules Object Semantics

- if `trial_enabled` is `false`, `trial_days` must be `null`
- if `trial_enabled` is `true`, `trial_days` is required and must be a positive integer

### Read Model Rules

- unsupported sort fields are rejected
- effective config uses `variant > product` fallback semantics
- disabled offers do not win effective config resolution

## Related Documents

- [Docs Overview](../README.md)
- [Plans & Offers Architecture](../architecture/plan-offers.md)
- [Plans & Offers Admin UI](../admin/plan-offers.md)
- [Plans & Offers Testing](../testing/plan-offers.md)
- [Roadmap](../roadmap/implementation-plan.md)
