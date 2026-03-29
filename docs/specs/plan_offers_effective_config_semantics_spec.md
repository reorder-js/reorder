# Reorder: Plans & Offers Effective Config Semantics Spec

This document covers step `2.2.4` from `documentation/implementation_plan.md`.

Goal:
- define how the final offer is resolved for a variant and for a subscription
- define what counts as a source record
- define what counts as a fallback candidate
- define what the resolved effective config represents
- define how Admin reads and future subscription workflows should use the resolved config

This specification builds on:
- `reorder/docs/specs/plan_offers_admin_spec.md`
- `reorder/docs/specs/plan_offers_domain_model_spec.md`
- `reorder/docs/specs/plan_offers_data_model_override_spec.md`

## 1. Core semantics

The `Plans & Offers` area has three separate concepts:

- source record
- fallback candidate
- resolved effective config

These concepts must not be mixed.

### Source record

A source record is a persisted `PlanOffer` record that can potentially define the final subscription offer.

There are two valid source record types:
- a product-level source record
- a variant-level source record

### Fallback candidate

A fallback candidate is a source record that did not win first priority, but may still become the final source if the higher-priority record is missing or inactive.

In practice:
- for variant resolution, the product-level source is the fallback candidate
- for product resolution, there is no lower-priority fallback candidate

### Resolved effective config

The resolved effective config is the final derived configuration returned by the read layer after resolution.

It is:
- not a persisted source of truth
- not an editable record
- not a snapshot of a subscription

It is a computed result based on currently available source records.

## 2. Source of truth

The only persisted source of truth is `PlanOffer`.

`ProductSubscriptionConfig` is derived state.

This means:
- Admin create/edit/toggle operations modify `PlanOffer`
- queries and validation logic may read `ProductSubscriptionConfig`
- subscriptions should not persist a live reference to the effective config as their long-term business state

## 3. Resolution inputs

Effective config resolution should accept one of two inputs:

- product context
- variant context

### Product context

Product context means:
- `product_id` is known
- `variant_id` is not part of the resolution input

### Variant context

Variant context means:
- `product_id` is known
- `variant_id` is known

Variant context is the more important resolution path for future subscription creation and plan-change validation.

## 4. Effective config for product context

When resolving effective config for a product:

1. read the product-level source record for `product_id`
2. if the record exists and is enabled, it becomes the resolved effective config
3. if the record does not exist, there is no effective config
4. if the record exists but is disabled, there is no active effective config

### Product-context result semantics

If a valid product-level source exists:
- `source_scope = product`
- `source_offer_id = product record id`
- all effective fields come from the product-level source record

If no valid source exists:
- `source_scope = null`
- `source_offer_id = null`
- the result is inactive or empty

## 5. Effective config for variant context

When resolving effective config for a variant:

1. read the variant-level source record for `variant_id`
2. if it exists and is enabled, it wins immediately
3. otherwise, read the product-level source record for `product_id`
4. if the product-level record exists and is enabled, it becomes the fallback source
5. otherwise, there is no active effective config

### Variant-context result semantics

If the variant-level record wins:
- `source_scope = variant`
- `source_offer_id = variant record id`
- all effective fields come from the variant-level source record

If the product-level record wins:
- `source_scope = product`
- `source_offer_id = product record id`
- all effective fields come from the product-level source record

If neither wins:
- `source_scope = null`
- `source_offer_id = null`
- the result is inactive or empty

## 6. Disabled record semantics

Disabled records are treated as inactive source records.

This means:
- a disabled variant-level record cannot win resolution
- a disabled product-level record cannot win resolution
- a disabled variant-level record does not block fallback to an enabled product-level record

This is important because `is_enabled` expresses active policy, not a blocking override state.

## 7. No merge semantics

Resolved effective config must use full-record semantics.

This means:
- if the variant-level record wins, all final config fields come from that variant-level record
- if the product-level record wins, all final config fields come from that product-level record

We do not support:
- merging product frequencies with variant discounts
- inheriting product rules while overriding only one variant field
- partial merge between two source records

This is a deliberate MVP constraint.

## 8. Effective config output contract

The resolved output should map to the logical contract of `ProductSubscriptionConfig`.

Recommended effective output:

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

### Field semantics

`product_id`
- identifies the product context of the result

`variant_id`
- identifies the variant context of the result when applicable

`source_offer_id`
- identifies the exact `PlanOffer` record that produced the result

`source_scope`
- identifies whether the result came from product-level or variant-level source

`is_enabled`
- indicates whether the resolved config is active and usable
- if no valid source exists, this should resolve to `false`

`allowed_frequencies`
- final allowed billing frequencies

`discount_per_frequency`
- final discounts corresponding to the winning source record

`rules`
- final offer rules corresponding to the winning source record

## 9. Empty or inactive result semantics

If no valid source record exists, the read model should still have deterministic semantics.

Recommended meaning:
- `source_offer_id = null`
- `source_scope = null`
- `is_enabled = false`
- `allowed_frequencies = []`
- `discount_per_frequency = []`
- `rules = null`

This makes later workflow validation easier because “no offer exists” can be represented as an explicit inactive config.

## 10. Difference between source detail and effective detail

These are separate read concerns:

### Source detail

Source detail is the Admin detail of a concrete `PlanOffer` record.

It answers:
- what was explicitly configured on this record
- what target this record belongs to
- whether this source record is enabled

### Effective detail

Effective detail is the resolved final configuration for a product or variant context.

It answers:
- which config actually applies right now
- whether that final config came from product-level or variant-level source
- what a future subscription action should validate against

Admin can display both, but they must not be treated as the same object.

## 11. Admin semantics

The Admin list for `Plans & Offers` should remain source-record based.

Meaning:
- each row represents one `PlanOffer`
- sorting and filtering apply to source records
- row actions edit, toggle, or inspect a source record

The Admin detail view may additionally show:
- resolved effective config summary
- source provenance
- fallback information

But Admin still edits only the source record.

## 12. Subscription semantics

Subscriptions must consume effective config at decision time, not as an always-live dependency.

There are two critical moments:
- subscription creation
- subscription plan change

At those moments, the system should:
1. resolve effective config for the requested product or variant
2. validate requested frequency or discount assumptions against the effective config
3. persist a subscription snapshot or pending update data derived from the accepted choice

This means:
- existing subscriptions should not retroactively change just because a `PlanOffer` source record changed later
- `PlanOffer` affects future decisions, not historical subscription state

## 13. Validation semantics for future workflows

Future workflows should treat effective config as the validation contract.

Examples:
- when creating a subscription, requested frequency must exist in `allowed_frequencies`
- when scheduling a plan change, the target variant must resolve to an active effective config
- if the resolved config is inactive, the workflow should reject the request

The workflow should not try to validate against:
- a random source record picked manually
- mixed product and variant fields
- Admin DTO summaries

It should validate against the resolved effective config only.

## 14. Provenance semantics

The resolved effective config should preserve provenance explicitly.

Required provenance fields:
- `source_offer_id`
- `source_scope`

Recommended optional presentation semantics:
- `resolution_reason = "direct_variant" | "fallback_product" | "no_match"`

This extra semantic does not need to be persisted in MVP, but it can be useful in query helpers and Admin detail UI.

## 15. Subscription snapshot semantics

When a subscription is created or updated using an effective config:
- the subscription should store its own selected operational data as snapshot
- the subscription should not rely on future re-resolution of the same config for historical correctness

Examples of data that can be snapshotted into subscription state:
- selected variant identifiers and labels
- selected frequency
- pricing snapshot
- rules-derived operational consequences if needed later

This keeps `Subscriptions` and `Plans & Offers` correctly separated:
- `Plans & Offers` defines current policy
- `Subscriptions` stores actual accepted operational state

## 16. Recommended read-layer behavior

The read layer should expose at least two categories of reads:

- source-record reads
- effective-config reads

### Source-record reads

Used by:
- Admin list
- Admin source detail
- source record editing

### Effective-config reads

Used by:
- plan offer effective summary in Admin detail
- future subscription create validation
- future plan-change validation
- any UI or API that needs the final currently applicable offer

## 17. Final recommendation

The final effective-config semantics for MVP should be:

1. `PlanOffer` is always the source record.
2. `ProductSubscriptionConfig` is always a derived result.
3. Variant resolution tries enabled variant source first.
4. If variant source is missing or disabled, resolution falls back to enabled product source.
5. If neither exists, the result is an explicit inactive config.
6. Resolution uses full-record override, never field-level merge.
7. Admin manages source records, not derived effective configs.
8. Subscription workflows validate against resolved effective config, then persist their own snapshots.

## 18. Impact on later steps

This semantic contract means later implementation steps should:
- add query helpers that resolve effective config explicitly
- avoid persisting materialized effective config tables in MVP
- build workflow validation on top of effective config resolution
- keep Admin DTOs clear about whether they represent source or resolved state
