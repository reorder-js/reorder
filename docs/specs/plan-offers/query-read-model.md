# Reorder: Plans & Offers Query and Read Model Spec

This document covers step `2.2.8` from `documentation/implementation_plan.md`.

Goal:
- define the Admin read model for `Plans & Offers`
- separate source-record list queries, source-record detail queries, and effective-config resolution
- define the helper structure for later implementation
- keep the read layer aligned with Medusa Query patterns and module isolation

This specification builds on:
- `reorder/docs/specs/plan-offers/admin-spec.md`
- `reorder/docs/specs/plan-offers/domain-model.md`
- `reorder/docs/specs/plan-offers/data-model-override.md`
- `reorder/docs/specs/plan-offers/effective-config-semantics.md`
- `reorder/docs/specs/plan-offers/module-links.md`

## 1. Read-model principles

The `Plans & Offers` read layer must distinguish between:

- source-record reads
- derived effective-config reads

This distinction is required because:
- Admin list and source detail are centered on `PlanOffer`
- effective config is derived from `PlanOffer`
- linked product/variant data is display enrichment, not the source of truth

The read layer should not blur these concerns into one generic helper.

## 2. Required helper categories

The Admin read model should expose three helper categories:

- list query helper
- detail query helper
- effective-config resolver

Recommended implementation layout:

```text
reorder/src/modules/plan-offer/utils/admin-query.ts
```

Within that file or namespace:
- one input type for list queries
- one function for list reads
- one function for detail reads
- one function for effective-config resolution

## 3. Source list query helper

The source list helper is responsible for:
- reading `PlanOffer` source records
- applying filtering, search, sorting, and pagination
- mapping source records to `PlanOfferAdminListItem`
- enriching the list with product and variant display data

It is not responsible for:
- mutating data
- resolving subscription snapshots
- performing business validation

### Recommended function shape

```ts
type ListAdminPlanOffersInput = {
  limit?: number
  offset?: number
  q?: string
  is_enabled?: boolean
  scope?: "product" | "variant"
  product_id?: string
  variant_id?: string
  frequency?: "week" | "month" | "year"
  order?: string
}
```

Example function naming:
- `listAdminPlanOffers(...)`

## 4. Source detail query helper

The source detail helper is responsible for:
- retrieving one source `PlanOffer` record by `id`
- enriching it with linked product and variant display data
- resolving effective-config summary for the same target context
- mapping the final result to `PlanOfferAdminDetail`

It is not responsible for:
- computing subscription snapshots
- applying mutations
- acting as the source of truth for effective config

Example function naming:
- `getAdminPlanOfferDetail(...)`

## 5. Effective-config resolver

The effective-config resolver is a separate concern.

It is responsible for:
- resolving final configuration for product context
- resolving final configuration for variant context
- applying `variant > product` fallback
- returning a derived `ProductSubscriptionConfig`

It is not responsible for:
- list pagination
- Admin source-record filtering
- HTTP response shape

Example function naming:
- `resolveProductSubscriptionConfig(...)`
- `resolveVariantSubscriptionConfig(...)`
- or one generic resolver with context-specific input

## 6. Why list/detail and effective config should stay separate

This separation follows Medusa-friendly layering:

- `PlanOffer` remains the source-record root for Admin CRUD views
- effective config is derived logic and should not replace source-record reads
- DTO mapping stays predictable because list/detail map source records, while effective config maps a derived contract

Without this separation:
- Admin detail becomes harder to reason about
- query logic mixes persistence and derivation concerns
- future subscription validation becomes coupled to Admin view logic

## 7. Query root strategy

For Admin list and source detail:
- the query root should be the `plan_offer` entity

For derived effective config:
- the resolver may query one or two `plan_offer` source records depending on the context

This is the cleanest strategy because:
- the source record is in the plugin module
- filtering and sorting are mostly based on source fields
- linked display data should be secondary enrichment

## 8. `query.graph()` versus `query.index()`

Following Medusa best practices:

### Use `query.graph()` for:

- source list on `plan_offer`
- source detail on `plan_offer`
- linked display-data enrichment when no cross-module linked filtering is needed
- effective-config resolution when resolving source records by direct fields like `product_id`, `variant_id`, `scope`, `is_enabled`

### Use `query.index()` only when:

- filtering by linked cross-module properties becomes necessary
- for example, if later the list must truly filter or sort by product title or SKU from linked records

At this stage, the design should avoid requiring `query.index()` for the primary Admin list path.

## 9. List query fields

The list query should fetch only fields needed for:
- filtering
- sorting
- DTO mapping
- effective summary mapping

Recommended source fields:
- `id`
- `name`
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`
- `allowed_frequencies`
- `frequency_intervals`
- `discount_per_frequency`
- `rules`
- `updated_at`
- `created_at`

Linked enrichment fields:
- `product.id`
- `product.title`
- `productVariant.id`
- `productVariant.title`
- `productVariant.sku`

Only request linked fields that are actually needed by the Admin DTO.

## 10. Detail query fields

The detail query should fetch:

Source fields:
- all list fields
- `metadata`

Linked enrichment:
- `product.id`
- `product.title`
- `productVariant.id`
- `productVariant.title`
- `productVariant.sku`

Derived companion data:
- effective config summary

The detail payload should keep source and derived data conceptually separate even if the response object nests them together for convenience.

## 11. List filtering rules

The list query should primarily filter by direct source fields.

Supported source-field filters:
- `is_enabled`
- `scope`
- `product_id`
- `variant_id`
- `frequency` through `frequency_intervals`
- `q` through source fields such as `name`

Recommended interpretation of `frequency`:
- `frequency=month` matches records whose `frequency_intervals` contain `month`

### Search semantics

The MVP search query should primarily search source-owned fields:
- `name`

If later you want search across:
- `product_title`
- `variant_title`
- `sku`

that should be treated as linked-data search and designed explicitly, not assumed for the basic helper.

## 12. Sorting rules

The list helper should divide sorting into:
- database-backed sorting
- optional in-memory sorting for derived display fields if absolutely necessary

### Database-backed sorting

Preferred sortable fields:
- `name`
- `scope`
- `is_enabled`
- `created_at`
- `updated_at`

### Derived or linked sorting

Fields such as:
- `product_title`
- `variant_title`

should not be treated as first-class sortable fields in the initial implementation unless the linked-query strategy is intentionally designed for them.

This keeps the initial read model predictable and fast.

## 13. Effective-config resolver inputs

The effective-config resolver should accept explicit context.

Recommended input shape:

```ts
type ResolveProductSubscriptionConfigInput =
  | {
      product_id: string
      variant_id?: undefined
    }
  | {
      product_id: string
      variant_id: string
    }
```

This keeps resolution explicit and avoids ambiguous “best effort” behavior.

## 14. Effective-config resolver outputs

The resolver should return the logical contract:

```ts
type ProductSubscriptionConfig = {
  product_id: string
  variant_id: string | null
  source_offer_id: string | null
  source_scope: "product" | "variant" | null
  is_enabled: boolean
  allowed_frequencies: PlanOfferAllowedFrequency[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[]
  rules: PlanOfferRules | null
}
```

Optional internal helper metadata may be useful during implementation:
- resolution reason
- resolved source record snapshot

But the public contract should remain stable and compact.

## 15. Resolution algorithm expectations

The effective-config resolver should implement the semantics already defined in the earlier specs:

### Product context

- resolve enabled product-level source by `product_id`
- if found, return it as effective config
- otherwise return an inactive/empty effective config

### Variant context

- resolve enabled variant-level source by `variant_id`
- if found, return it
- otherwise resolve enabled product-level source by `product_id`
- if found, return it as fallback
- otherwise return an inactive/empty effective config

The resolver must not:
- merge fields from both records
- treat disabled records as blocking overrides

## 16. DTO mapping strategy

The mapping layer should be explicit and separated from fetching.

Recommended categories:
- source record -> list DTO
- source record + effective summary -> detail DTO
- source record -> effective-config summary DTO helper

This mirrors the structure already used in `Subscriptions`, where mapping is explicit and not hidden inside route code.

## 17. Admin DTO implications

### List DTO

The list DTO should be built from:
- source `PlanOffer`
- linked product display data
- linked variant display data when applicable
- a compact summary of rules and effective source

### Detail DTO

The detail DTO should include:
- all source record configuration fields
- linked display fields
- effective-config summary derived through the resolver

This keeps Admin transparent:
- “what this record says”
- “what currently applies”

## 18. Error semantics

The read layer should define clear not-found behavior.

### List helper

- returns an empty list if nothing matches

### Detail helper

- throws a domain not-found error if the source `PlanOffer` does not exist

### Effective-config resolver

- does not throw for “no active config”
- returns an explicit inactive/empty result instead

This distinction matters because:
- missing source detail is an error
- missing effective config is valid business state

## 19. Recommended implementation structure

Recommended structure inside `reorder/src/modules/plan-offer/utils/admin-query.ts`:

- input types
- source-record field lists
- source record types
- helper functions for:
  - frequency label mapping
  - discount summary mapping
  - rule summary mapping
  - product/variant display mapping
- list helper
- detail helper
- effective-config resolver

This structure keeps the implementation close to the style already used by `Subscriptions`.

## 20. Final recommendation

The final Admin read model for `Plans & Offers` should be:

1. List helper for source `PlanOffer` records.
2. Detail helper for one source `PlanOffer` record plus effective summary.
3. Separate effective-config resolver for derived `ProductSubscriptionConfig`.
4. Primary filtering and sorting based on source-owned fields.
5. Linked product/variant fields used as display enrichment.
6. `query.graph()` as the default tool, with `query.index()` reserved for later true cross-module filtering needs.

## 21. Impact on later steps

This design means the next steps should:
- implement `admin-query.ts` for `planOffer`
- keep API routes thin and mapping-oriented
- expose separate read paths for source list/detail and effective config
- let Admin UI consume a stable DTO contract without embedding fallback logic in React components
