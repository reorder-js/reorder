# Subscriptions Architecture

This document describes the current architecture of the `Subscriptions` area in the `Reorder` plugin.

It focuses on the implemented system, not on the initial design assumptions.

## Goal

The `Subscriptions` area provides Admin users with an operational view over recurring subscriptions.

The current implementation supports:
- listing subscriptions
- viewing subscription details
- showing subscription context on standard Medusa order details
- showing subscription discount context on standard Medusa order details
- pausing subscriptions
- resuming subscriptions
- cancelling subscriptions
- scheduling plan changes
- editing the shipping address
- skipping the next delivery
- creating subscriptions from store carts
- customer-facing Store API for subscription account actions

## Architectural Overview

The implementation is split into five main layers:

1. domain module
2. workflows
3. admin API
4. store API
5. admin UI

Each layer has a clear responsibility:

- the domain module owns the subscription data model and persistence
- workflows own business mutations
- admin API exposes read and write endpoints for the dashboard
- store API exposes storefront-safe read and write endpoints for customer account and PDP
- admin UI renders list and detail views and calls the admin endpoints

## 1. Domain Module

The `subscription` custom module is the owner of the recurring subscription domain.

It contains:
- domain types
- data model
- service
- module export

Key design choice:
- the subscription entity stores the operational state required by Admin and future renewal flows directly in its own model
- it does not rely on live reads from customer or product modules for core list/detail rendering

This keeps the Admin read model stable and reduces coupling to external entity changes.

## 2. Data Model

The `subscription` model stores:
- identity and lifecycle fields
- cadence fields
- scheduling fields
- operational flags
- snapshots used by Admin and future renewals

Core scalar fields include:
- `id`
- `reference`
- `status`
- `customer_id`
- `product_id`
- `variant_id`
- `frequency_interval`
- `frequency_value`
- `started_at`
- `next_renewal_at`
- `last_renewal_at`
- `paused_at`
- `cancelled_at`
- `cancel_effective_at`
- `skip_next_cycle`
- `is_trial`
- `trial_ends_at`

Snapshot JSON fields include:
- `customer_snapshot`
- `product_snapshot`
- `pricing_snapshot`
- `shipping_address`
- `pending_update_data`
- `metadata`

Why snapshots are used:
- the Admin should display a stable picture of the subscription even if the linked customer or product changes later
- future renewal logic needs operational data local to the subscription

## 3. Read Path

The read path is optimized for Admin list and detail views.

Main components:
- admin route handlers under `src/api/admin/subscriptions`
- normalization helpers in `src/api/admin/subscriptions/utils.ts`
- query helpers in `src/modules/subscription/utils/admin-query.ts`

### List Flow

For the list view:
1. the Admin UI sends query params to `GET /admin/subscriptions`
2. the admin route validates and normalizes query input
3. `listAdminSubscriptions(...)` builds filters and sorting rules
4. the query layer reads subscriptions through `query.graph(...)`
5. records are mapped to Admin DTOs used by the DataTable

Supported capabilities include:
- pagination
- search
- filtering
- sorting

Some sorting is handled in the database, while some derived fields are sorted in memory.

### Detail Flow

For the detail view:
1. the Admin UI requests `GET /admin/subscriptions/:id`
2. the route resolves the subscription through the query helper
3. the result is mapped to a detail DTO
4. the Admin detail page renders the current subscription state and pending plan change preview

Read models now expose both:
- `next_renewal_at` as the technical billing anchor used by renewal processing
- `effective_next_renewal_at` as the projected next delivery shown in Admin and Storefront when `skip_next_cycle` is enabled

## 4. Write Path

All state-changing operations are routed through workflows.

Implemented mutations:
- `pause`
- `resume`
- `cancel`
- `schedule-plan-change`
- `update-shipping-address`
- `skip-next-delivery`
- `create-subscription-from-cart`

Write path pattern:
1. the Admin UI submits a mutation to a custom admin route
2. the route validates the request payload
3. the route calls a workflow
4. the workflow performs business validation and updates the subscription
5. the route returns the refreshed subscription detail payload

This keeps business logic out of HTTP handlers.

### Store purchase flow

The store create flow uses:
- `POST /store/carts/:id/sync-subscription-pricing`
- `POST /store/carts/:id/subscribe`
- `create-subscription-from-cart`

The flow validates subscription metadata on the line item, synchronizes the cart pricing for the selected cadence, blocks mixed cart usage, completes the cart into a standard Medusa `order`, checks idempotency through the `subscription-order` link, creates the `subscription`, links it to `customer`, `cart`, and `order`, and creates the first upcoming `renewal_cycle`.

Pricing synchronization is handled by a dedicated workflow:
- load subscription line items from the cart
- resolve effective `Plans & Offers` config for the selected cadence
- apply or remove the manual line-item adjustment
- refresh cart items, taxes, and payment collection before checkout continues

Current adjustment semantics:
- adjustment identity uses `provider_id = "subscription_discount"`
- adjustment description is `Subscription discount`
- adjustment amount is stored tax-inclusive
- cart adjustments intentionally avoid `code`, so Medusa promotion flows do not treat them as promo codes

### Store customer account flow

The current store account flow uses:
- `GET /store/customers/me/subscriptions`
- `GET /store/customers/me/subscriptions/:id`
- `POST /store/customers/me/subscriptions/:id/pause`
- `POST /store/customers/me/subscriptions/:id/resume`
- `POST /store/customers/me/subscriptions/:id/change-frequency`
- `POST /store/customers/me/subscriptions/:id/change-address`
- `POST /store/customers/me/subscriptions/:id/skip-next-delivery`
- `POST /store/customers/me/subscriptions/:id/swap-product`
- `POST /store/customers/me/subscriptions/:id/retry-payment`
- `POST /store/customers/me/subscriptions/:id/cancellation`

These routes:
- require customer auth
- validate ownership against the authenticated customer
- reuse existing workflows where possible
- return storefront-safe DTOs instead of admin detail contracts
- expose projected read-model fields such as `effective_next_renewal_at`
- expose `scheduled_plan_change` when a pending plan update already exists

### Store PDP offer flow

The current PDP offer flow uses:
- `GET /store/products/:id/subscription-offer`

The route resolves effective `Plans & Offers` config with `variant > product` precedence and returns storefront-safe offer data for PDP pricing and cadence selection.

## 5. Workflows

Workflows are the mutation boundary of the `Subscriptions` area.

They are responsible for:
- validating legal state transitions
- updating subscription lifecycle fields
- updating pending plan change data
- updating shipping address data
- returning a consistent subscription result back to the API layer

The route layer remains thin and orchestration-focused.

## 6. Admin API Architecture

The Admin API exposes custom routes dedicated to the `Subscriptions` pages.

Implemented read routes:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`

Implemented mutation routes:
- `POST /admin/subscriptions/:id/pause`
- `POST /admin/subscriptions/:id/resume`
- `POST /admin/subscriptions/:id/cancel`
- `POST /admin/subscriptions/:id/schedule-plan-change`
- `POST /admin/subscriptions/:id/update-shipping-address`

The API layer uses:
- Zod validators
- authenticated admin requests
- query helpers for reads
- workflows for writes

## 7. Store API Architecture

The Store API exposes custom storefront routes dedicated to:
- subscription checkout
- customer account subscription list and detail
- customer account subscription actions
- PDP subscription offer resolution

Implemented read routes:
- `GET /store/customers/me/subscriptions`
- `GET /store/customers/me/subscriptions/:id`
- `GET /store/products/:id/subscription-offer`

Implemented mutation routes:
- `POST /store/carts/:id/sync-subscription-pricing`
- `POST /store/carts/:id/subscribe`
- `POST /store/customers/me/subscriptions/:id/pause`
- `POST /store/customers/me/subscriptions/:id/resume`
- `POST /store/customers/me/subscriptions/:id/change-frequency`
- `POST /store/customers/me/subscriptions/:id/change-address`
- `POST /store/customers/me/subscriptions/:id/skip-next-delivery`
- `POST /store/customers/me/subscriptions/:id/swap-product`
- `POST /store/customers/me/subscriptions/:id/retry-payment`
- `POST /store/customers/me/subscriptions/:id/cancellation`

The Store API layer uses:
- customer authentication middleware
- storefront-specific DTO mapping
- workflow-backed mutations
- ownership checks before mutation execution

## 8. Admin UI Architecture

The Admin UI is implemented as custom Medusa Admin routes.

Current screens:
- subscriptions list page
- subscription detail page

It also extends the built-in Medusa `Order detail` page with a widget that resolves the `subscription_order` link and renders subscription status plus a link to the linked subscription.

### List Page

The list page is built with Medusa `DataTable`.

It supports:
- pagination
- search
- filters
- sorting
- row actions
- row navigation to detail

Data loading follows the Medusa pattern:
- the display query always loads on mount
- modal and drawer queries are separate from the main display query

### Detail Page

The detail page contains:
- subscription overview
- customer and product information
- shipping address
- pending plan change preview
- top-right action menu

It also provides two edit flows through Drawers:
- schedule plan change
- edit shipping address

This matches the Medusa pattern of using Drawers for editing existing data.

## 9. Query Invalidation Strategy

The Admin UI uses explicit query invalidation after mutations.

After a successful mutation:
- the subscriptions list query is invalidated
- the subscription detail query is invalidated

This ensures that:
- the detail page stays fresh after edits
- the list reflects the latest status after navigation back

## 10. Error and Loading Handling

The `Subscriptions` UI follows Medusa-style state handling:
- list pages use DataTable loading and empty states
- detail pages show explicit loading and error states
- drawers show local loading and error states for modal-only data

This avoids coupling the main display state to drawer-only data loading.

## 11. Testing Strategy

The area is covered by:
- module/service tests
- workflow and query integration tests
- admin HTTP integration tests
- scenario-based admin flow integration test

Important note:
- there is no browser E2E layer in the current plugin
- the main end-to-end business flow is verified through Medusa-supported integration tests

## 11. Boundaries of Responsibility

`Subscriptions` currently owns:
- the subscription entity
- Admin operational management of subscriptions
- pending plan changes
- shipping address updates
- lifecycle materialization for `active`, `paused`, `past_due`, and `cancelled`
- lifecycle fields such as `paused_at`, `cancelled_at`, `cancel_effective_at`, and `next_renewal_at`

It does not yet own:
- offer definition and subscription configuration rules
- renewal execution
- payment recovery and dunning
- cancellation and retention process state
- retention recommendation state
- retention offer history
- churn reason classification workflow

Those concerns are intentionally left for later areas:
- `Plans & Offers`
- `Renewals`
- `Dunning`

The implemented `Cancellation & Retention` area now adds a separate process layer on top of the subscription lifecycle.

Current boundary with `Cancellation & Retention`:
- `Subscription` remains the source of truth for lifecycle state
- `CancellationCase` remains the source of truth for cancellation and retention process state
- `RetentionOfferEvent` remains the source of truth for concrete retention-offer history

This means:
- `paused` and `cancelled` may be materialized by cancellation workflows
- but those workflows materialize into `Subscription`, they do not replace it as the lifecycle owner
- final cancel sets `cancel_effective_at`
- final cancel clears `next_renewal_at`
- retained outcomes do not set `cancel_effective_at`

## 12. Why This Structure

This architecture keeps the system practical:
- reads are optimized for Admin operations
- writes are centralized in workflows
- UI state is separated cleanly from domain logic
- future renewal and dunning logic can build on the same subscription core without rewriting the Admin layer
