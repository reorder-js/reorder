# Payments Architecture

This document describes how the `Reorder` plugin charges subscriptions and how the payment method of a subscription is managed.

It focuses on the implemented system, not on the initial design assumptions.

## Goal

Recurring charges happen without the customer being present. The plugin therefore needs a reusable payment method reference that can be charged off-session at renewal time, and a way to replace that reference when it stops working.

The current implementation supports:
- capturing a reusable payment method at subscription checkout
- charging renewals off-session with that payment method
- retrying failed renewal charges from the dunning flow
- listing the saved payment methods of a customer
- changing the payment method a subscription renews with, from Admin and from the storefront

## Provider Model

The plugin is payment provider agnostic. It never talks to a payment service directly and never depends on a provider SDK.

All payment operations go through the Medusa Payment Module:
- account holders link a Medusa customer to a customer record in the payment service
- `listPaymentMethods` returns the payment methods saved for an account holder
- payment sessions and `authorizePaymentSession` / `capturePayment` perform the charge

Any payment provider implementing that interface works. The Stripe Module Provider (`pp_stripe_stripe`) does, and is the provider this area is primarily exercised with.

Provider specific requirement for Stripe: the storefront must initialize the checkout payment session with `setup_future_usage: "off_session"`, otherwise Stripe does not save the card and no reusable payment method reference exists at renewal time.

## Payment Context

`subscription.payment_context` is the operational record of how a subscription is charged. It is a JSON column on the subscription model with the following fields:

- `payment_provider_id`
  the Medusa payment provider used for renewals, for example `pp_stripe_stripe`
- `payment_method_reference`
  the reusable payment method identifier charged off-session at renewal time
- `customer_payment_reference`
  the customer identifier in the payment service, derived from the account holder
- `source_payment_collection_id`
  the payment collection of the original checkout
- `source_payment_session_id`
  the payment session of the original checkout

`source_payment_collection_id` and `source_payment_session_id` document the original checkout. They are never rewritten after the subscription is created, including when the payment method changes.

## Lifecycle

### 1. Checkout

`validate-subscription-cart` builds the payment context while completing a subscription cart.

The reusable payment method reference is resolved in this order:
1. `payment_method` on the cart payment session data
2. the most recently saved payment method of the customer's account holder for that provider

Checkout fails with a validation error when neither is available, because a subscription that cannot be renewed must not be created.

### 2. Renewal

`process-renewal-cycle` creates the renewal order, then charges it when the order total is greater than zero:
1. create or update the order payment collection
2. create a payment session for `payment_provider_id` with `payment_method`, `off_session: true`, `confirm: true` and `capture_method: "automatic"`
3. authorize the payment session
4. capture the payment

A missing `payment_provider_id` or `payment_method_reference` fails the cycle before any charge is attempted.

### 3. Dunning

Failures are classified by source (`payment_session`, `payment_provider`, `payment_capture`) and open a dunning case. `run-dunning-retry` replays the same charge against the renewal order using the subscription's current payment context.

Because retries read the payment context at retry time, changing the payment method of a subscription with an open dunning case makes the next retry use the new payment method. This is the recovery path for a declined or expired card.

## Payment Method Management

`update-subscription-payment-method` changes which payment method a subscription renews with.

Behavior:
- allowed for subscriptions in `active`, `paused` or `past_due` status
- the payment method must be a saved payment method of the subscription's own customer for the target provider, otherwise the update is rejected
- `provider_id` is optional and defaults to the subscription's current `payment_provider_id`; it is required when the subscription has no provider configured
- only `payment_provider_id`, `payment_method_reference` and `customer_payment_reference` are rewritten
- the step compensates by restoring the previous subscription record
- a `subscription.payment_method_updated` activity-log event records the change

The workflow does not trigger a payment retry. Retrying is an explicit action through the dunning retry routes.

## Exposed Data

Payment method summaries returned by the Store and Admin APIs are normalized and contain no raw provider payload:

```
{
  "id": "pm_123",
  "provider_id": "pp_stripe_stripe",
  "type": "card",
  "brand": "visa",
  "last4": "4242",
  "exp_month": 4,
  "exp_year": 2030,
  "created_at": 1700000000
}
```

Card fields are read defensively. Providers that expose no card metadata yield `null` fields rather than an error.

Resolving the summary of the currently stored payment method is best effort in both the Store and Admin detail responses: when the payment method was removed in the payment service or the provider is unreachable, `payment_method` is `null` while `payment_provider_id` is still returned. The Admin subscription detail view renders a warning in that case, because it means renewals will fail until a new payment method is selected.

## Activity Log

`subscription.payment_method_updated` records the payment method change.

The event stores only non-sensitive identifiers in `previous_state` and `new_state`:
- `payment_provider_id`
- `brand`
- `last4`
- `exp_month`
- `exp_year`

Payment method references, customer payment references and payment session identifiers are part of the activity-log sensitive key set and are never persisted in log state.

## Related Documents

- `architecture/subscriptions.md`
- `architecture/renewals.md`
- `architecture/dunning.md`
- `api/admin-subscriptions.md`
- `api/store-subscription-payment-methods.md`
- `api/store-subscription-checkout.md`
