# Store Customer Subscriptions & Cancellation

This document describes the minimal Store API currently exposed for customer-driven cancellation testing.

## Endpoints

### `GET /store/customers/me/subscriptions`

Returns the authenticated customer's subscriptions with minimal storefront data:
- `id`
- `reference`
- `status`
- `product_title`
- `variant_title`
- `next_renewal_at`
- `active_cancellation_case`

Authentication:
- customer auth required

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
