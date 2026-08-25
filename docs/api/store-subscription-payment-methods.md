# Store Subscription Payment Methods

This document describes the current customer-facing Store API for managing the payment method a subscription renews with.

See `architecture/payments.md` for how the payment context is captured and charged.

## `GET /store/customers/me/subscriptions/:id/payment-methods`

Lists the authenticated customer's saved payment methods for the subscription's payment provider.

Authentication and ownership:
- customer auth required
- the subscription must belong to the authenticated customer

### Success Response

Status:
- `200 OK`

Response:

```json
{
  "payment_provider_id": "pp_stripe_stripe",
  "payment_methods": [
    {
      "id": "pm_123",
      "provider_id": "pp_stripe_stripe",
      "type": "card",
      "brand": "visa",
      "last4": "4242",
      "exp_month": 4,
      "exp_year": 2030,
      "created_at": 1700000000,
      "is_current": true
    }
  ]
}
```

Behavior:
- `payment_provider_id` is `null` when the subscription has no payment context yet
- `payment_methods` is empty when the customer has no account holder or no saved payment method for that provider
- `is_current` marks the payment method the subscription currently renews with
- card fields are `null` for providers that do not expose card metadata
- no raw payment provider payload is returned

### Common Errors

- `404 not_found`
  Subscription does not exist or does not belong to the authenticated customer.

## `POST /store/customers/me/subscriptions/:id/payment-method`

Changes the payment method the subscription renews with.

Authentication and ownership:
- customer auth required
- the subscription must belong to the authenticated customer

Request body:

```json
{
  "payment_method_id": "pm_123",
  "provider_id": "pp_stripe_stripe"
}
```

Validation:
- `payment_method_id: string`
- `provider_id?: string`

Behavior:
- `provider_id` defaults to the subscription's current payment provider and is required when the subscription has none
- the payment method must be a saved payment method of the authenticated customer for that provider
- allowed for `active`, `paused` and `past_due` subscriptions
- records a `subscription.payment_method_updated` activity-log event with the storefront customer as actor
- does not trigger a payment retry

### Success Response

Status:
- `200 OK`

Response:
- full store subscription detail payload, the same shape as `GET /store/customers/me/subscriptions/:id`

### Common Errors

- `400 invalid_data`
  Invalid body payload, unknown payment method, or payment method not owned by the authenticated customer.
- `404 not_found`
  Subscription does not exist or does not belong to the authenticated customer.
- `409 conflict`
  Subscription status does not allow updating the payment method.

## Recovering a Failed Payment

When a renewal charge fails, dunning opens a case and the storefront can recover it in two steps:

1. `POST /store/customers/me/subscriptions/:id/payment-method` with a working saved payment method
2. `POST /store/customers/me/subscriptions/:id/retry-payment`

The retry reads the subscription's payment context at retry time, so it charges the newly selected payment method.

## Saving a Payment Method

The plugin only selects among payment methods already saved with the payment provider. Saving a new payment method is a storefront and provider concern.

For Stripe, the storefront must initialize the checkout payment session with `setup_future_usage: "off_session"` so the card is stored on the customer's Stripe account holder and becomes available to these routes.

## Related Documents

- `architecture/payments.md`
- `api/store-customer-cancellations.md`
- `api/store-subscription-checkout.md`
- `api/admin-subscriptions.md`
