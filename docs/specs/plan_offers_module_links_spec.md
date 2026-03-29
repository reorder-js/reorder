# Reorder: Plans & Offers Module Links Spec

This document covers step `2.2.5` from `documentation/implementation_plan.md`.

Goal:
- define the module links required by `Plans & Offers`
- define the link direction and relationship semantics
- define how linked product and variant data should be read in Admin
- keep the read layer aligned with Medusa module-isolation patterns

This specification builds on:
- `reorder/docs/specs/plan_offers_admin_spec.md`
- `reorder/docs/specs/plan_offers_domain_model_spec.md`
- `reorder/docs/specs/plan_offers_data_model_override_spec.md`
- `reorder/docs/specs/plan_offers_effective_config_semantics_spec.md`

## 1. Required module links

`Plans & Offers` needs two module links:

- `planOffer <-> product`
- `planOffer <-> productVariant`

These links are required because:
- the source record belongs to the plugin module
- the Admin UI must render product and variant display data
- the plugin must remain isolated from the Product Module
- future workflows may need authoritative reads across the custom module and Product Module

## 2. One link per file

Following Medusa best practices:
- each module link must live in its own file
- do not group multiple `defineLink(...)` calls in one file

Recommended file structure:

```text
reorder/src/links/plan-offer-product.ts
reorder/src/links/plan-offer-variant.ts
```

## 3. Link direction

The preferred direction is:
- from the custom module entity `planOffer`
- to the Product Module entities `product` and `productVariant`

Recommended definitions:

```ts
defineLink(PlanOfferModule.linkable.planOffer, ProductModule.linkable.product)
defineLink(PlanOfferModule.linkable.planOffer, ProductModule.linkable.productVariant)
```

This direction is preferred because `PlanOffer` is a custom source record associated with commerce entities.

This follows the Medusa guidance for association-style links:
- when a custom entity is associated with a commerce entity, define the link from the custom model to the commerce model

## 4. Why this direction is preferred

This direction matches the mental model of the feature:
- a `PlanOffer` record belongs to or targets a product
- a `PlanOffer` record may belong to or target a variant
- the custom entity is the domain object we manage in the plugin

It also stays consistent with the existing `subscription-*` links already present in the plugin codebase.

## 5. Cardinality semantics

The module links express association, not override policy.

They should not be treated as the place that enforces:
- product-level uniqueness
- variant-level uniqueness
- effective-config precedence

Those behaviors belong to:
- the domain model
- workflow validation
- query resolution logic

### Product link semantics

A `PlanOffer` may be linked to one product.

At the domain level:
- a product-level `PlanOffer` must always point to one `product_id`
- a variant-level `PlanOffer` must also point to one `product_id`

### Variant link semantics

A `PlanOffer` may be linked to one variant.

At the domain level:
- `scope = product` means there is no variant target
- `scope = variant` means there must be one variant target

## 6. Link usage versus scalar IDs

The model should keep both:
- scalar IDs in the `PlanOffer` entity
- module links to the Product Module

Required scalar IDs:
- `product_id`
- `variant_id`

Why both are needed:
- scalar IDs are the primary mechanism for filtering, sorting, indexing, and override resolution
- links provide cross-module display reads without breaking module isolation
- this follows the practical Medusa pattern already used in the plugin’s `Subscriptions` area

## 7. Admin read strategy

Admin should distinguish between:
- source-record reads
- linked display-data reads

### Source-record reads

Source-record reads should use the `PlanOffer` entity as the base.

They are responsible for:
- list pagination
- list filtering by source fields
- source detail retrieval
- effective-config summary composition

### Linked display-data reads

Linked reads should be used to enrich Admin responses with commerce display data such as:
- product title
- variant title
- variant SKU

Linked reads are for display only.

They should not replace the source `PlanOffer` record as the root of the read model.

## 8. Admin list read rules

For the Admin list:
- the root list entity should remain `PlanOffer`
- list filters should primarily target direct fields on `PlanOffer`
- product and variant titles are display fields, not primary control fields for the data model

Preferred filters on direct fields:
- `product_id`
- `variant_id`
- `scope`
- `is_enabled`
- source record identifiers or names

If Admin later needs filtering by linked fields such as product title:
- treat this as linked-data filtering
- consider `query.index()` or a dedicated resolution strategy
- do not overload a simple source-record read path with cross-module filtering assumptions

## 9. Admin detail read rules

For the Admin detail view:
- retrieve the source `PlanOffer` record first
- retrieve linked product and variant display data as enrichment
- compute effective-config summary separately from source retrieval

The detail page should be able to show:
- source record configuration
- product display name
- variant display name when relevant
- variant SKU when relevant
- effective source summary

## 10. Product display semantics

When a `PlanOffer` targets a product-level scope:
- Admin should display the product title
- variant display should be rendered as `All variants` or equivalent source-level label
- linked variant display data is not required for that record

When a `PlanOffer` targets a variant-level scope:
- Admin should display the product title
- Admin should display the variant title
- Admin should display SKU when available

This keeps the UI aligned with the DTO design already defined in the Admin spec.

## 11. Linked data is not the source of truth

Product and variant reads from linked entities must be treated as display enrichment only.

They must not replace:
- `product_id`
- `variant_id`
- `scope`
- effective-config resolution

This matters because:
- a product title may change later
- a variant title or SKU may change later
- the source policy and override logic must remain rooted in the custom module’s own record

## 12. Query strategy guidance

Recommended query strategy for later implementation:

### Source list/detail

Use the `PlanOffer` entity as the source query root.

Use direct fields for:
- filtering
- sorting
- pagination
- uniqueness validation support

### Linked enrichment

Use module links and linked reads to enrich the result with:
- product title
- variant title
- SKU

### Cross-module filtering

If filtering by linked fields becomes necessary:
- use `query.index()` or a dedicated linked-query strategy
- do not assume `query.graph()` can filter across linked modules from the source root in all cases

This aligns with Medusa’s Query API limitations and best practices.

## 13. Effective config and module links

The effective config does not require its own link definitions.

Why:
- `ProductSubscriptionConfig` is derived state
- it resolves from source `PlanOffer` records
- linked product and variant records are still read through the same two source-level links

The links support effective config indirectly by:
- confirming the associated commerce entities
- enabling Admin display data
- supporting future validation and display flows

## 14. Creation and maintenance semantics

In later workflow steps, links should be created and maintained consistently with the source record:

- when creating a product-level `PlanOffer`, create the product link
- when creating a variant-level `PlanOffer`, create the product link and variant link
- when updating a target in a future allowed flow, links must be updated accordingly
- when deleting or replacing links, the link direction must match the original `defineLink(...)` order

Even though target mutation is not part of the current Admin edit flow, the link policy should still be explicit now.

## 15. Delete and lifecycle expectations

For MVP, the links should be treated as associations supporting reads and future lifecycle logic.

Delete-cascade behavior should be decided carefully during implementation.

Current recommendation:
- do not use module-link design to implicitly encode business deletion policy
- let workflows and domain rules handle business-safe removal or update behavior

This avoids accidental destructive coupling between commerce entity deletion and plugin policy data.

## 16. Final recommendation

The final link strategy for `Plans & Offers` should be:

1. Define one link from `planOffer` to `product`.
2. Define one link from `planOffer` to `productVariant`.
3. Keep one `defineLink(...)` per file.
4. Keep `product_id` and `variant_id` as explicit scalar fields in the source model.
5. Treat linked product and variant data as Admin display enrichment, not as source-of-truth policy data.
6. Keep Admin list/detail rooted in `PlanOffer`.
7. Use direct fields for primary filtering and sorting.
8. Use linked reads for display fields and escalate to `query.index()` only when true cross-module filtering is required.

## 17. Impact on later steps

This decision means the implementation steps that follow should:
- add two concrete link files in `src/links/`
- create and dismiss links in workflows using the exact same direction as `defineLink(...)`
- read product and variant display data through linked queries or companion reads
- keep Admin DTOs and query helpers centered on source-record semantics
