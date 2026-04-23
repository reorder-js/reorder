# Store Subscription Checkout

## `POST /store/carts/:id/sync-subscription-pricing`

Synchronizes subscription pricing on a cart before payment-session creation or subscription completion.

Purpose:
- resolve the effective `Plans & Offers` config for the subscription line item
- apply or remove the manual line-item adjustment for the selected cadence
- refresh cart totals, taxes, and payment collection before checkout continues

Current adjustment semantics:
- the cart adjustment is stored as a manual line-item adjustment
- it uses `provider_id = "subscription_discount"`
- it uses `description = "Subscription discount"`
- it is marked `is_tax_inclusive = true`
- the cart adjustment intentionally does not use `code`, so Medusa promotion flows do not treat it as a promo code

Current route behavior:
- returns whether subscription items were found
- returns whether cart adjustments changed
- is safe to call repeatedly during cart, delivery, and payment steps

## `POST /store/carts/:id/subscribe`

Completes a subscription cart and creates the linked subscription record.

MVP metadata contract:

- `line_item.metadata.is_subscription: boolean`
- `line_item.metadata.frequency_interval: "week" | "month" | "year"`
- `line_item.metadata.frequency_value: positive integer`

Optional cart metadata:

- `cart.metadata.purchase_mode: "subscription"`

Rules:

- line item metadata is the source of truth
- if `purchase_mode` is present, it must be `"subscription"`
- mixed cart is not supported in MVP
- subscription checkout currently supports exactly `1` subscription line item with quantity `1`
- mixed cart or missing subscription item returns `400`
- standard Medusa cart completion for one-time checkout stays unchanged
- route is idempotent after cart completion: if the created order is already linked to a subscription, the existing subscription is returned

Checkout sequencing:

- subscription pricing is synchronized before `completeCartWorkflow`
- the cart is refreshed before completion so payment collection and order totals use the discounted amount
- after order creation, the order adjustment may be labeled with `subscription_discount` for Medusa Admin display
