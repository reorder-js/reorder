# Reorder: Plans & Offers Domain Model Spec

This document covers step `2.2.2` from `documentation/implementation_plan.md`.

Goal:
- define the domain contract for `PlanOffer`
- define the logical contract for `ProductSubscriptionConfig`
- decide which data belongs to the model as regular columns
- decide which data can be stored as JSON
- provide a stable foundation for workflows, Admin filtering, and future effective-config logic

The design follows Medusa patterns:
- a custom module owns its domain
- commerce entities are connected through module links, not direct DML relations
- fields used for filtering, sorting, and validation should be stored explicitly
- JSON is appropriate for flexible configuration, but not for critical operational fields

## 1. Architectural assumptions

The `Plans & Offers` area has two conceptual levels:

- `PlanOffer`
- `ProductSubscriptionConfig`

`PlanOffer` is the source record persisted in the plugin module.

`ProductSubscriptionConfig` is a logical contract describing the final subscription configuration that applies to a product or variant after fallback resolution.

In practice:
- `PlanOffer` will be an entity in its own module
- `ProductSubscriptionConfig` does not need to be a separate table at this stage
- `ProductSubscriptionConfig` can be computed by a query helper or domain service from one or two `PlanOffer` records

## 2. Responsibility boundaries

### `PlanOffer`

`PlanOffer` is responsible for:
- storing the source subscription offer configuration
- identifying the target `product` or `variant`
- storing the activation flag
- storing allowed billing frequencies
- storing discount mapping per frequency
- storing offer business rules

`PlanOffer` is not responsible for:
- the lifecycle of a customer subscription
- customer snapshots
- renewal schedules
- resulting subscription mutations

### `ProductSubscriptionConfig`

`ProductSubscriptionConfig` is responsible for:
- describing the final configuration for a selected product or variant
- identifying the source of the effective configuration
- representing `variant > product` fallback

`ProductSubscriptionConfig` does not need to be a persistence entity at this stage.

## 3. Scope and fallback

The system supports two scopes:
- `product`
- `variant`

Semantics:
- a `product` record defines the base offer for the whole product
- a `variant` record defines an override for a specific variant
- if an active `variant` record exists, it has priority over the `product` record
- if a `variant` record does not exist or is inactive, the effective config may fall back to the active `product` record

Priority:
- `variant` > `product`

## 4. `PlanOffer` domain contract

Minimal domain contract:

- `id`
- `name`
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`
- `allowed_frequencies`
- `discount_per_frequency`
- `rules`
- `metadata`

### Proposed logical shape

```ts
type PlanOffer = {
  id: string
  name: string
  scope: "product" | "variant"
  product_id: string
  variant_id: string | null
  is_enabled: boolean
  allowed_frequencies: SubscriptionFrequencyOption[]
  discount_per_frequency: SubscriptionDiscountPerFrequency[]
  rules: PlanOfferRules | null
  metadata: Record<string, unknown> | null
}
```

## 5. Regular model fields

The following fields should be regular model columns:

- `id`
- `name`
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`

Why:
- they are needed for Admin filtering and sorting
- they are needed for indexing
- they are needed for integrity and conflict validation
- this matches Medusa patterns, where IDs from external entities are often stored explicitly in custom models

## 6. Why `product_id` and `variant_id` should be scalar fields

Following practical Medusa patterns:
- relations to product and variant will be implemented through module links
- even so, `product_id` and `variant_id` should exist as explicit model fields

Why:
- simplifies list/detail queries
- simplifies target-based filtering
- simplifies Admin list indexes
- makes validation rules like `variant scope requires variant_id` straightforward

## 7. `variant_id` and scope semantics

Rules:
- when `scope = product`, `variant_id = null`
- when `scope = variant`, `variant_id` is required
- a variant-level record always stores `product_id` as well

Why:
- a `variant` operationally belongs to a concrete product
- Admin list and future effective-config queries need both IDs
- this also simplifies filtering and future smoke checks with `Subscriptions`

## 8. `allowed_frequencies`

`allowed_frequencies` is the domain list of supported subscription purchase frequencies.

### Proposed shape

```ts
type SubscriptionFrequencyOption = {
  interval: "week" | "month" | "year"
  value: number
}
```

Examples:
- `{ interval: "month", value: 1 }`
- `{ interval: "month", value: 2 }`
- `{ interval: "week", value: 1 }`

### Storage decision

`allowed_frequencies` should be stored as JSON.

Why:
- it is a list of structured values
- frequencies are logically part of one offer configuration
- they do not require a separate entity in MVP

### Domain rules

- the list cannot be empty
- every item must have a positive `value`
- duplicate `interval + value` pairs are not allowed

## 9. `discount_per_frequency`

`discount_per_frequency` describes the discount assigned to a specific frequency.

### Proposed shape

```ts
type SubscriptionDiscountPerFrequency = {
  interval: "week" | "month" | "year"
  value: number
  discount_type: "percentage" | "fixed"
  discount_value: number
}
```

### Storage decision

`discount_per_frequency` should be stored as JSON.

Why:
- it is a small nested configuration tied to frequency
- it does not need a separate table yet
- it is convenient to validate in workflows

### Domain rules

- a discount may only exist for a frequency present in `allowed_frequencies`
- for one `interval + value` pair, at most one discount is allowed
- missing a discount for an allowed frequency is valid
- `discount_type = percentage` requires percentage-range validation in workflows
- `discount_type = fixed` uses the stored number directly, without multiplying by 100, consistent with Medusa pricing behavior

## 10. `rules`

`rules` stores additional business restrictions for the offer.

### Proposed shape

```ts
type PlanOfferRules = {
  minimum_cycles: number | null
  trial_enabled: boolean
  trial_days: number | null
  stacking_policy:
    | "allowed"
    | "disallow_all"
    | "disallow_subscription_discounts"
}
```

### Storage decision

`rules` should be stored as JSON.

Why:
- it is a grouped set of business configuration fields
- the shape can evolve in later stages without changing core model columns
- these are not the first-choice fields for primary MVP list filtering

### Domain rules

- if set, `minimum_cycles` must be a positive integer
- if `trial_enabled = false`, `trial_days` should be `null`
- if `trial_enabled = true`, `trial_days` must be a positive integer

## 11. `metadata`

`metadata` remains a standard JSON field.

Why:
- this is the standard Medusa pattern for extra non-core data
- it should not store data that requires strict domain validation
- it should not store fields needed for filtering, sorting, or effective-config logic

## 12. `ProductSubscriptionConfig` logical contract

`ProductSubscriptionConfig` represents the final configuration after fallback resolution.

### Proposed shape

```ts
type ProductSubscriptionConfig = {
  product_id: string
  variant_id: string | null
  source_offer_id: string | null
  source_scope: "product" | "variant" | null
  is_enabled: boolean
  allowed_frequencies: SubscriptionFrequencyOption[]
  discount_per_frequency: SubscriptionDiscountPerFrequency[]
  rules: PlanOfferRules | null
}
```

### Semantics

- `source_offer_id` identifies which `PlanOffer` record produced the final configuration
- `source_scope` tells whether the effective config comes from a product-level or variant-level record
- if there is no active configuration, `source_offer_id` and `source_scope` may be `null`

## 13. How `ProductSubscriptionConfig` is resolved

### For a product

When requesting config for a product without a variant:
- use the active `PlanOffer` record with `scope = product`
- the result describes the base product configuration

### For a variant

When requesting config for a variant:
1. look for an active `PlanOffer` record with `scope = variant`
2. if it exists, it is the source of the effective config
3. if it does not exist, look for an active `PlanOffer` record with `scope = product`
4. if that record exists, fallback comes from the product
5. if no active record exists, the configuration is empty or inactive

## 14. Should `ProductSubscriptionConfig` be a separate table

At this stage: no.

Why:
- it is a derived concept
- its data can be computed from `PlanOffer`
- this avoids duplication and synchronization risk

A separate table would only become useful if:
- effective config must be materialized for performance reasons
- more complex multi-layer inheritance appears
- auditable effective-config snapshots become necessary

## 15. Indexes and future model impact

This contract suggests future indexes at least for:
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`

Optional later:
- composite index for `(scope, product_id)`
- composite index for `(scope, variant_id)`

`allowed_frequencies`, `discount_per_frequency`, `rules`, and `metadata` should not be primary indexing candidates in MVP.

## 16. Module links

The next step should introduce links:
- `planOffer <-> product`
- `planOffer <-> variant`

The domain contract intentionally assumes:
- explicit `product_id`
- explicit `variant_id`
- separate module links

This follows the practical Medusa pattern:
- links preserve module isolation
- scalar IDs simplify queries and filtering

## 17. Domain integrity rules

Minimum consistency rules:

- `scope = product` requires `product_id` and forbids `variant_id`
- `scope = variant` requires `product_id` and `variant_id`
- `allowed_frequencies` cannot be empty
- `discount_per_frequency` cannot contain frequencies outside `allowed_frequencies`
- duplicate frequencies are not allowed
- duplicate discounts for the same frequency are not allowed

In addition, later backend steps must decide the uniqueness policy:
- whether to allow exactly one active `product` record per `product_id`
- whether to allow exactly one active `variant` record per `variant_id`

Recommended for MVP:
- one `product` record per `product_id`
- one `variant` record per `variant_id`

This keeps effective-config logic and Admin UX simpler.

## 18. Impact on later steps

This contract means later `2.2.3+` steps should:
- design the data model around the `PlanOffer` entity
- treat `ProductSubscriptionConfig` as a read model or logical contract
- add module links to product and variant
- build workflows around validating `allowed_frequencies`, `discount_per_frequency`, and `rules`
- prepare query helpers for list, detail, and effective config
