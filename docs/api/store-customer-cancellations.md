# Store Customer Subscriptions

This document describes the current customer-facing Store API for subscription account actions.

## Endpoints

### `GET /store/customers/me/subscriptions`

Returns the authenticated customer's subscriptions with storefront summary data:
- `id`
- `reference`
- `status`
- `product_title`
- `variant_title`
- `next_renewal_at`
- `active_cancellation_case`

Authentication:
- customer auth required

### `GET /store/customers/me/subscriptions/:id`

Returns storefront-safe subscription detail data:
- `id`
- `reference`
- `status`
- `product_title`
- `variant_title`
- `frequency_interval`
- `frequency_value`
- `next_renewal_at`
- `last_renewal_at`
- `shipping_address`
- `payment_status`
- `payment_provider_id`
- `payment_recovery`
- `active_cancellation_case`

Authentication and ownership:
- customer auth required
- the subscription must belong to the authenticated customer

### `POST /store/customers/me/subscriptions/:id/pause`

Pauses the authenticated customer's subscription through the existing pause workflow.

Request body:

```json
{
  "reason": "Taking a short break",
  "effective_at": "2026-04-15T10:00:00.000Z"
}
```

Response:
- refreshed subscription detail payload
- payload includes both `next_renewal_at` and projected `effective_next_renewal_at`

### `POST /store/customers/me/subscriptions/:id/resume`

Resumes the authenticated customer's subscription through the existing resume workflow.

Request body:

```json
{
  "resume_at": "2026-04-20T10:00:00.000Z",
  "preserve_billing_anchor": true
}
```

Response:
- refreshed subscription detail payload

### `POST /store/customers/me/subscriptions/:id/change-frequency`

Schedules a cadence change for the authenticated customer's subscription.

Request body:

```json
{
  "frequency_interval": "month",
  "frequency_value": 2,
  "effective_at": "2026-05-01T10:00:00.000Z"
}
```

Notes:
- the current variant stays unchanged
- cadence is validated against active `Plans & Offers`

Response:
- refreshed subscription detail payload

### `POST /store/customers/me/subscriptions/:id/change-address`

Updates the subscription shipping address.

Request body:

```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "address_1": "Main Street 1",
  "city": "Copenhagen",
  "postal_code": "2100",
  "country_code": "dk"
}
```

Response:
- refreshed subscription detail payload

### `POST /store/customers/me/subscriptions/:id/skip-next-delivery`

Marks the next renewal cycle as skipped.

Request body:
- no request body

Response:
- refreshed subscription detail payload

### `POST /store/customers/me/subscriptions/:id/swap-product`

Schedules a product or variant swap for the subscription.

Request body:

```json
{
  "variant_id": "variant_123",
  "frequency_interval": "month",
  "frequency_value": 1,
  "effective_at": "2026-05-01T10:00:00.000Z"
}
```

Notes:
- uses the same plan-change workflow as admin
- target variant must belong to the subscription product and be allowed by active `Plans & Offers`

Response:
- refreshed subscription detail payload

### `POST /store/customers/me/subscriptions/:id/retry-payment`

Runs a manual payment retry for a retry-eligible subscription recovery case.

Request body:

```json
{
  "reason": "Customer requested immediate retry"
}
```

Response:
- refreshed subscription detail payload
- route returns `409` if there is no retry-eligible payment recovery case

### `POST /store/customers/me/subscriptions/:id/cancellation`

Starts a cancellation case for the authenticated customer's subscription using the existing cancellation workflow.

Entry context:
- storefront customer request from the subscription list flow

Request body:

```json
{
  "reason": "Too expensive right now",
  "reason_category": "price",
  "notes": "Customer started cancellation from storefront"
}
```

Authentication and ownership:
- customer auth required
- the subscription must belong to the authenticated customer

Response:
- minimal `cancellation_case` payload with `id`, `status`, `subscription_id`, and submitted reason fields

## Auth Model

- all routes require `authenticate("customer", ["session", "bearer"])`
- ownership is validated against the authenticated customer's `actor_id`
