# Store Subscription Routes

## Goal

- define the minimal customer-facing Store API required by the storefront MVP
- keep customer subscription actions on Store routes, not admin routes
- keep mutations workflow-backed and validator-driven

## Required routes

- `GET /store/customers/me/subscriptions/:id`
  - returns storefront-safe subscription detail DTO
- `POST /store/customers/me/subscriptions/:id/pause`
- `POST /store/customers/me/subscriptions/:id/resume`
- `POST /store/customers/me/subscriptions/:id/skip-next-delivery`
- `POST /store/customers/me/subscriptions/:id/change-frequency`
- `POST /store/customers/me/subscriptions/:id/change-address`
- `POST /store/customers/me/subscriptions/:id/swap-product`
- `POST /store/customers/me/subscriptions/:id/retry-payment`

## Design rules

- use `GET`, `POST`, `DELETE` only
- keep validation in Store API middleware
- keep business rules and ownership checks in workflows
- keep route handlers thin
- return storefront-safe DTOs, not raw internal models

## Recommended contracts

- `pause`
  - optional body
  - returns updated status summary
- `resume`
  - optional body
  - returns updated status summary
- `skip-next-delivery`
  - optional body
  - returns new `next_renewal_at`
- `change-frequency`
  - body:
    - `frequency_interval`
    - `frequency_value`
- `change-address`
  - body should support:
    - existing customer address reference
    - or full shipping address snapshot
- `swap-product`
  - body should identify target variant and selected cadence
- `retry-payment`
  - optional body
  - returns retry result and refreshed payment recovery state

## Detail DTO minimum scope

- `id`
- `reference`
- `status`
- `product_title`
- `variant_title`
- `frequency_interval`
- `frequency_value`
- `next_renewal_at`
- `shipping_address`
- `payment_status`
- `payment_recovery`
- `active_cancellation_case`

## 6.2 Store DTO for storefront

- Store DTO must stay separate from admin DTO
- admin response shapes should not be reused automatically in storefront routes
- Store DTO should be:
  - simplified
  - customer-facing
  - stable for UI rendering
  - free of internal operator fields

## Store DTO rules

- expose only fields required by customer account UX
- avoid workflow-internal state, audit payloads, internal IDs from linked systems, and operator notes
- normalize enums and nested objects for predictable frontend rendering
- prefer explicit summary fields over leaking backend structure
- keep response shape stable even if admin contracts evolve

## Recommended Store DTOs

- subscription list item:
  - `id`
  - `reference`
  - `status`
  - `product_title`
  - `variant_title`
  - `next_renewal_at`
  - `active_cancellation_case`
- subscription detail:
  - `id`
  - `reference`
  - `status`
  - `product_title`
  - `variant_title`
  - `frequency_interval`
  - `frequency_value`
  - `next_renewal_at`
  - `shipping_address`
  - `payment_status`
  - `payment_recovery`
  - `active_cancellation_case`
- action mutation response:
  - `subscription`
  - `result`
  - optional `message`

## Fields to exclude from Store DTO

- operator-only notes
- admin-only audit fields
- raw workflow step payloads
- internal provider diagnostics
- fields used only for admin recovery tooling
- unrelated linked entity data not needed by storefront

## 6.3 Subscription offer resolution for PDP

- storefront should not hardcode subscription offer data on PDP
- subscription offer data should come from `Reorder` `Plans & Offers`
- a dedicated Store read endpoint is required for product page rendering

## Recommended route

- `GET /store/products/:id/subscription-offer`
  - product-scoped route
- optional alternative:
  - `GET /store/subscription-offers?variant_id=...`

## Minimum response scope

- `is_subscription_available`
- `product_id`
- `variant_id`
- `allowed_frequencies`
- `discount`
- `minimum_cycles`
- `trial`

## Frequency payload

- each allowed frequency should expose:
  - `frequency_interval`
  - `frequency_value`
  - optional display label
- cadence should be returned in canonical backend form, not storefront-only labels

## Discount payload

- discount response should make semantics explicit:
  - `type`
  - `value`
  - `compare_at_amount`
  - `subscription_amount`
- storefront must not infer discount logic from unrelated price fields

## PDP impact

- PDP selector should render only frequencies returned by this endpoint
- PDP dynamic pricing should use this endpoint as source of truth
- without this route, storefront stays on temporary adapter data from metadata or local config

## 6.4 Mixed cart support

- current `POST /store/carts/:id/subscribe` blocks mixed cart
- if mixed cart is required for business MVP, backend must define a new checkout semantic
- storefront UX should stay blocked until this semantic is decided

## Required backend decision

- option A:
  - one mixed checkout flow creates:
    - one order
    - one or more subscription records
- option B:
  - checkout is explicitly split into:
    - one-time checkout flow
    - subscription checkout flow

## Recommendation

- make this a backend/domain decision before final checkout UI is implemented
- do not fake mixed cart support in storefront while `POST /store/carts/:id/subscribe` still rejects it

## Storefront impact

- cart and checkout should keep the current mixed cart guard until backend support exists
- final CTA logic and summary copy depend on the selected backend semantic

## MVP priority

1. `GET :id`
2. `pause`
3. `resume`
4. `change-frequency`
5. `change-address`
6. `skip-next-delivery`
7. `retry-payment`
8. `swap-product`

## Storefront impact

- account detail stays partial until `GET :id` exists
- customer actions stay disabled until matching Store routes exist
- `retry payment` and `address override` should stay hidden or disabled without backend support
