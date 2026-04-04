# Store Subscription Checkout

`POST /store/carts/:id/subscribe`

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
- subscription checkout currently supports exactly 1 subscription line item with quantity `1`
- mixed cart or missing subscription item returns `400`
- standard Medusa cart completion for one-time checkout stays unchanged
- route is idempotent after cart completion: if the created order is already linked to a subscription, the existing subscription is returned
