# Reorder: Plans & Offers Final Data Model and Override Strategy Spec

This document covers step `2.2.3` from `documentation/implementation_plan.md`.

Goal:
- define the final persistence model for `Plans & Offers`
- define the override strategy for product-level and variant-level configuration
- decide whether the feature should use one model, two models, or a hybrid structure
- define the effective-config resolution rules with explicit `variant > product` priority

This specification builds on:
- `reorder/docs/specs/plan-offers/admin-spec.md`
- `reorder/docs/specs/plan-offers/domain-model.md`

## 1. Design decision summary

The final design should use:
- one persistence entity: `PlanOffer`
- one logical read-model contract: `ProductSubscriptionConfig`

The final override strategy should be:
- product-level configuration is the base layer
- variant-level configuration is an override layer
- priority is always `variant > product`
- if no active variant-level record exists, fallback goes to the active product-level record

This means:
- we do not create separate persistence tables for product offers and variant offers
- we do not materialize `ProductSubscriptionConfig` as a database table in MVP
- we compute effective configuration from source `PlanOffer` records

## 2. Why one persistence model is preferred

Recommended model:
- one `PlanOffer` entity with:
  - `scope`
  - `product_id`
  - `variant_id`
  - `is_enabled`
  - configuration JSON fields

Why this is preferred over two separate models:
- the domain is still one concept: a subscription offer configuration
- Admin list/detail should display a single record type
- workflows can validate one source entity shape
- one set of routes and DTOs is easier to maintain
- one module service and one migration path are simpler

Why this is preferred over a persisted `effective config` table:
- effective config is derived state
- duplicating it would create synchronization risk
- MVP does not need a materialized projection yet

## 3. Rejected alternatives

### 3.1 Two persistence entities

Rejected option:
- `ProductPlanOffer`
- `VariantPlanOffer`

Why it is worse:
- duplicates logic and validation
- duplicates Admin handling and query logic
- complicates shared DTOs
- makes fallback resolution more scattered

### 3.2 Source table plus persisted effective table

Rejected option:
- `PlanOffer` source table
- `ProductSubscriptionConfig` table or snapshot table

Why it is worse for MVP:
- derived data must be synchronized after every mutation
- harder to keep correct when overrides change
- unnecessary complexity until performance requires materialization

## 4. Final persistence model

The persistence layer should revolve around one entity:
- `PlanOffer`

### Proposed persisted fields

Plain fields:
- `id`
- `name`
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`

JSON fields:
- `allowed_frequencies`
- `discount_per_frequency`
- `rules`
- `metadata`

Timestamps:
- Medusa default timestamps such as `created_at` and `updated_at`

### Scope semantics

- `scope = product`
  - configuration applies to the product as a whole
  - `variant_id = null`
- `scope = variant`
  - configuration applies only to one variant
  - `variant_id` is required
  - `product_id` is also required

## 5. Uniqueness strategy

Recommended operational uniqueness rules for MVP:

- at most one `PlanOffer` record for a given `product_id` with `scope = product`
- at most one `PlanOffer` record for a given `variant_id` with `scope = variant`

This should be treated as a domain invariant, and ideally also supported by indexes or validation.

Why:
- it prevents ambiguous override resolution
- it keeps Admin UX deterministic
- it avoids having to pick “the winning record” among multiple source records

Implication:
- updates should modify the existing record instead of creating parallel competing records for the same target

## 6. Source of truth strategy

The source of truth is always a `PlanOffer` record.

There are only two valid source cases:
- the product-level source record
- the variant-level source record

`ProductSubscriptionConfig` is never the source of truth.
It is always computed from `PlanOffer`.

## 7. Override strategy

The override model is intentionally shallow and deterministic.

### Resolution for product context

When resolving config for a product without selecting a variant:
- read the product-level `PlanOffer`
- if the record exists and is enabled, it is the effective config
- if the record does not exist or is disabled, there is no active product-level config

### Resolution for variant context

When resolving config for a variant:
1. look for the variant-level `PlanOffer`
2. if it exists and is enabled, it wins
3. otherwise, look for the product-level `PlanOffer`
4. if it exists and is enabled, it becomes the fallback source
5. otherwise, there is no active config

Priority remains:
- enabled variant-level record
- enabled product-level record
- no config

## 8. Disabled record behavior

Disabled records should not block fallback.

Meaning:
- a disabled variant-level record is treated as non-effective
- if a disabled variant-level record exists and an enabled product-level record exists, fallback goes to the product-level record
- a disabled product-level record means the product-level base config is inactive

Why this behavior is preferred:
- `is_enabled` should mean “this record is not active”
- disabled records should not act as hard overrides
- this keeps effective-config logic simpler and more intuitive in Admin

Rejected behavior:
- “disabled variant override suppresses product fallback”

Why rejected:
- it creates hidden blocking semantics
- it makes Admin behavior harder to explain
- it introduces an extra policy layer not visible in the current contract

## 9. Override granularity

The override is record-level, not field-level.

Meaning:
- if a variant-level record exists and is enabled, its configuration is the full effective config
- we do not merge `allowed_frequencies` from product and discounts from variant
- we do not partially inherit `rules` from product while overriding only one field

Why this is the right MVP decision:
- simpler mental model
- simpler workflows
- simpler validation
- simpler Admin rendering
- fewer edge cases when fields evolve later

Rejected alternative:
- field-level merge between product and variant records

Why rejected:
- much more complex conflict rules
- harder to validate
- harder to explain in Admin detail and future storefront behavior

## 10. Effective config read model

`ProductSubscriptionConfig` should be resolved at read time.

### Effective shape

The effective config should expose:
- `product_id`
- `variant_id`
- `source_offer_id`
- `source_scope`
- `is_enabled`
- `allowed_frequencies`
- `discount_per_frequency`
- `rules`

### Resolution output rules

If variant-level source wins:
- `source_scope = variant`
- `source_offer_id = variant offer id`
- all config fields come from the variant-level record

If product-level source wins:
- `source_scope = product`
- `source_offer_id = product offer id`
- all config fields come from the product-level record

If no source exists:
- `source_scope = null`
- `source_offer_id = null`
- config is empty or represented as inactive by the query layer

## 11. Admin implications

This model directly supports the Admin UX already defined:

- list view shows one row per source `PlanOffer`
- detail view shows the source record plus effective-config summary
- create flow creates a product-level or variant-level source record
- edit flow updates one existing source record
- enable/disable toggles source-record activity

This avoids a mismatch where Admin edits one object but actually reads another table behind the scenes.

## 12. Query implications

For source record list/detail:
- use the `PlanOffer` entity directly

For effective config:
- compute from one or two `PlanOffer` records

Recommended query approach:
- use direct model fields for product/variant filtering
- use links only when reading related commerce display data

This matches Medusa best practices:
- source data stays in the custom module
- linked product/variant data is read through links or companion reads
- effective config remains a derived read model

## 13. Validation implications

This override strategy implies the following validation rules in later workflow steps:

- a variant-level record must belong to a valid `product_id` / `variant_id` pair
- product-level records cannot set `variant_id`
- variant-level records must set `variant_id`
- only one source record per target is allowed
- a variant-level record can exist even if a product-level record does not exist
- if both records exist, variant-level record fully overrides the product-level record

## 14. Index implications

The final model suggests at least these indexes:
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`

Recommended uniqueness/index strategy:
- unique constraint or equivalent invariant for product-level target:
  - `(scope = product, product_id)`
- unique constraint or equivalent invariant for variant-level target:
  - `(scope = variant, variant_id)`

If conditional unique indexes are not practical in the chosen Medusa migration path, the uniqueness guarantee should still be enforced at the workflow/domain layer.

## 15. Integration implications for `Subscriptions`

This strategy is compatible with future `Subscriptions` integration:

- when creating or changing a subscription, the system can resolve `ProductSubscriptionConfig`
- the resolved config determines which frequencies and discounts are valid
- the subscription can then store its own snapshot independently

This keeps responsibilities clear:
- `PlanOffer` controls the source offer policy
- `ProductSubscriptionConfig` exposes the effective policy
- `Subscription` stores the selected operational snapshot

## 16. Final recommendation

The final MVP data model and override strategy should be:

1. Store all source configurations in one `PlanOffer` model.
2. Use `scope`, `product_id`, and `variant_id` to distinguish product-level and variant-level targets.
3. Enforce one source record per target.
4. Resolve `ProductSubscriptionConfig` dynamically from source records.
5. Apply simple precedence: enabled `variant` record overrides enabled `product` record.
6. Treat disabled records as inactive, not as blocking overrides.
7. Use full-record override, not field-level merge.

## 17. Impact on later steps

This decision means the next implementation steps should:
- implement one `planOffer` module, not separate product/variant modules
- build migrations and indexes around one table
- build query helpers that return source record DTOs and effective config DTOs
- implement workflows with deterministic override resolution
- keep Admin UI centered on source record management
