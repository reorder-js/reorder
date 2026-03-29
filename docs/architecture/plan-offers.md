# Plans & Offers Architecture

This document describes the current architecture of the `Plans & Offers` area in the `Reorder` plugin.

It focuses on the implemented system, not on the initial design assumptions.

## Goal

The `Plans & Offers` area provides the commercial configuration layer for subscription-enabled products in Admin.

The current implementation supports:
- configuring product-level subscription offers
- configuring variant-level subscription offers
- defining allowed billing frequencies
- defining discount rules per frequency
- defining additional offer rules such as trial policy and stacking policy
- listing, inspecting, creating, editing, and toggling plan offers in Admin
- resolving effective subscription configuration with `variant > product` priority
- enforcing active offer configuration during subscription plan-change flows

## Architectural Overview

The implementation is split into four main layers:

1. domain module
2. workflows
3. admin API
4. admin UI

Each layer has a clear responsibility:

- the domain module owns the `plan_offer` data model and persistence
- workflows own mutations and business validation
- the admin API exposes read and write routes for dashboard consumers
- the admin UI renders the management page and create/edit flows

## 1. Domain Module

The `planOffer` custom module is the owner of subscription offer configuration.

It contains:
- domain types
- the `plan_offer` data model
- the module service
- module-level utility helpers for read models and effective config resolution

Key design choice:
- the persisted source of truth is always `PlanOffer`
- effective subscription configuration is derived at read time
- no separate persisted model is used for resolved configuration

This keeps the domain simple and makes fallback behavior explicit.

## 2. Data Model

The `plan_offer` model stores:
- identity and targeting fields
- activation state
- frequency configuration
- discount configuration
- additional rules and metadata

Core fields include:
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
- `metadata`

### Scope Model

The model supports two targeting scopes:

- `product`
- `variant`

Product-scoped records apply to a product as a whole.

Variant-scoped records apply to one concrete variant and take precedence over product-scoped configuration during effective config resolution.

### Why Both `allowed_frequencies` and `frequency_intervals` Exist

`allowed_frequencies` stores the full logical configuration, including interval and numeric cadence value.

`frequency_intervals` stores the flattened set of interval names used to support faster filtering in Admin.

This is a deliberate read-model optimization for list queries.

### Indexing Strategy

The current model and migrations support indexing for:
- `scope`
- `product_id`
- `variant_id`
- `is_enabled`
- `name`
- `created_at`
- `updated_at`
- `frequency_intervals`

The architecture also uses unique constraints to prevent duplicate active targets at the persistence layer:
- one product-scoped offer per product
- one variant-scoped offer per variant

## 3. Effective Config Semantics

The `Plans & Offers` area distinguishes between:
- persisted source records
- fallback candidates
- resolved effective configuration

The only persisted source of truth is `PlanOffer`.

The resolved effective configuration is derived state represented by `ProductSubscriptionConfig`.

### Resolution Priority

The effective config follows a strict priority order:

1. active variant-scoped offer
2. active product-scoped offer
3. inactive or empty result

This means the effective config uses `variant > product` semantics.

### No Merge Semantics

The effective config uses full-record semantics.

If a variant-level offer wins, all effective fields come from that variant-level record.

If a product-level offer wins, all effective fields come from that product-level record.

The implementation does not merge frequencies, discounts, or rules across source records.

### Inactive Result Semantics

If no active source record exists, the resolved result is explicit rather than nullable:

- `source_offer_id = null`
- `source_scope = null`
- `is_enabled = false`
- `allowed_frequencies = []`
- `discount_per_frequency = []`
- `rules = null`

This makes downstream validation simpler in workflows that consume offer configuration.

## 4. Read Path

The read path is optimized for Admin list and detail rendering.

Main components:
- admin route handlers under `src/api/admin/subscription-offers`
- route utilities under `src/api/admin/subscription-offers/utils.ts`
- read helpers in `src/modules/plan-offer/utils/admin-query.ts`
- effective config resolution in `src/modules/plan-offer/utils/effective-config.ts`

### List Flow

For the list view:
1. the Admin UI sends query params to `GET /admin/subscription-offers`
2. the route validates and normalizes query input
3. `listAdminPlanOffers(...)` applies filters, sorting, and pagination
4. the query layer reads `plan_offer` records through `query.graph(...)`
5. product and variant display data is resolved separately
6. each item is mapped to the Admin list DTO, including effective config summary

The list supports:
- pagination
- search
- filters
- database-backed sorting
- in-memory sorting for selected derived fields

### Detail Flow

For the detail view:
1. the Admin UI requests `GET /admin/subscription-offers/:id`
2. the route resolves the source record through the query helper
3. display data and effective config are resolved
4. the result is mapped to the Admin detail DTO

The detail payload represents:
- the editable source record
- target product and variant display data
- effective config summary derived from the current resolution rules

### Effective Config Resolution

Effective config resolution is implemented as a reusable domain utility rather than an Admin-only helper.

This allows the same resolution logic to be used by:
- Admin read models
- subscription workflows
- future storefront or renewal validation flows

## 5. Write Path

All state-changing operations are routed through workflows.

Implemented mutations:
- create or upsert plan offer
- update plan offer
- toggle plan offer enabled state

Write path pattern:
1. the Admin UI submits a mutation to a custom admin route
2. the route validates the request payload
3. the route calls a workflow
4. the workflow step performs business validation and persists the change
5. the route returns the refreshed detail payload

This keeps business logic out of HTTP handlers.

## 6. Workflows

Workflows are the mutation boundary of the `Plans & Offers` area.

The current mutation layer is built around three workflows:
- `create-or-upsert-plan-offer`
- `update-plan-offer`
- `toggle-plan-offer`

They are responsible for:
- validating target correctness
- normalizing frequency, discount, and rules payloads
- persisting source record changes
- returning a consistent plan-offer result back to the API layer

### Shared Validation Logic

The workflows use shared helpers for:
- scope normalization
- frequency normalization
- discount normalization
- rules normalization
- target existence validation
- duplicate target detection
- compensation payload preparation

Business validation includes:
- product vs variant target correctness
- variant ownership under the selected product
- positive integer frequency values
- unique frequency combinations
- discounts only for allowed frequencies
- discount value range checks
- trial rule consistency

### Compensation and Rollback

The create and update flows store previous state for compensation.

This keeps workflow behavior aligned with Medusa’s mutation and rollback model.

The route layer remains thin and orchestration-focused.

## 7. Admin API Architecture

The Admin API exposes custom routes dedicated to the `Plans & Offers` page.

Implemented read routes:
- `GET /admin/subscription-offers`
- `GET /admin/subscription-offers/:id`

Implemented mutation routes:
- `POST /admin/subscription-offers`
- `POST /admin/subscription-offers/:id`
- `POST /admin/subscription-offers/:id/toggle`

The API layer uses:
- Zod validators
- authenticated admin requests
- query helpers for reads
- workflows for writes

As with other Medusa areas in the plugin, route handlers stay thin and orchestration-focused.

## 8. Admin UI Architecture

The Admin UI is implemented as a custom Medusa Admin page for `Plans & Offers`.

The current UI includes:
- a list page backed by Medusa `DataTable`
- create flow with a `FocusModal`
- edit flow with a `Drawer`
- dedicated product and variant selection flows

The page supports:
- search
- filtering
- sorting
- pagination
- create
- edit
- enable or disable actions

Data loading follows the Medusa dashboard pattern:
- the display query loads on mount
- modal and drawer queries are separate from the main display query
- successful mutations invalidate the display and detail queries explicitly

## 9. Integration with Subscriptions

`Plans & Offers` is the commercial configuration layer used by the `Subscriptions` area.

The implemented integration point is the subscription plan-change flow.

During `schedule-plan-change`:
- the subscription workflow resolves the effective config for the subscription product and requested variant
- the workflow verifies that an active offer exists
- the workflow verifies that the requested frequency is allowed by the effective config
- the workflow rejects plan changes that violate active offer configuration

This means `Plans & Offers` already influences what can be scheduled for a subscription in Admin.

The ownership boundary remains clear:
- `Plans & Offers` owns offer policy
- `Subscriptions` owns subscription lifecycle state and pending plan changes

## 10. Query Invalidation Strategy

The Admin UI uses explicit query invalidation after successful mutations.

After create, update, or toggle:
- the plan offers list query is invalidated
- the affected detail query is invalidated

This ensures that:
- the table reflects the latest effective state
- the detail and edit flows stay in sync after save operations

## 11. Testing Strategy

The area is currently covered by:
- module/service tests
- workflow and query integration tests
- admin HTTP integration tests
- scenario-based admin flow integration testing
- smoke-level integration with `Subscriptions`

Important note:
- there is no browser E2E layer in the current plugin
- the main end-to-end business flow is verified through Medusa-supported integration tests

## 12. Boundaries of Responsibility

`Plans & Offers` currently owns:
- subscription offer source records
- product-level and variant-level offer targeting
- effective config resolution
- Admin management of offer configuration
- validation rules for offer structure and supported combinations

It does not yet own:
- storefront purchase flows
- recurring order generation
- renewal execution
- payment retry logic
- pricing execution beyond describing offer policy

## Related Documents

- [Docs Overview](../README.md)
- [Plans & Offers Admin API](../api/admin-plan-offers.md)
- [Plans & Offers Admin UI](../admin/plan-offers.md)
- [Plans & Offers Testing](../testing/plan-offers.md)
- [Roadmap](../roadmap/implementation-plan.md)
- [Plans & Offers Specs](../specs/plan_offers_admin_spec.md)
