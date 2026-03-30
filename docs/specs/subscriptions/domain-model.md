# Reorder: Subscription Domain Model Spec

This document completes step `2.1.3` from `documentation/implementation_plan.md`.

Goal:
- design the final `Subscription` domain model
- determine which data belongs directly to the module
- determine which data should be stored as snapshots
- determine which data should be connected through module links

The design is based on Medusa patterns:
- a custom module owns the domain
- cross-module relations are handled through `defineLink`
- snapshots are used only where Admin and history require a stable read model

## 1. Architectural assumptions

- `Subscription` is its own domain entity in the custom `subscription` module.
- Data from other Medusa modules is not modeled as direct DML relations.
- Connections to commerce entities are implemented with module links.
- Snapshots are stored where the current state of an external entity should not affect the historical or operational view of the subscription.
- Fields needed for Admin filtering and sorting should be stored explicitly as model fields, not only inside `metadata` or JSON blobs.

## 2. Statuses

At this stage, the `Subscription` domain supports:

- `active`
- `paused`
- `cancelled`
- `past_due`

We do not add yet:
- `expired`
- `failed`

Why:
- they are outside the current `Subscriptions` scope
- `failed` fits better in the renewals/dunning layer
- `expired` can be added later if the lifecycle requires it

## 3. Direct model fields

The following fields belong directly to the `subscription` model and should be stored as regular columns:

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

## 4. Why these direct fields exist

### `reference`

A stable identifier for Admin display and operational handling.

### `status`

Required for:
- list filtering
- status transition validation
- controlling available Admin actions

### `customer_id`, `product_id`, `variant_id`

These IDs are stored explicitly even though module links are also planned.

Why:
- simplifies filtering
- simplifies indexing
- simplifies list/detail queries
- aligns with common Medusa practice for models that operationally “belong to” external entities

### `frequency_interval`, `frequency_value`

These fields define the cadence/frequency core and are needed for:
- the Admin list
- sorting
- the `schedule-plan-change` mutation
- future renewals

### `started_at`, `next_renewal_at`, `last_renewal_at`

These are the core lifecycle and scheduling fields.

### `paused_at`, `cancelled_at`, `cancel_effective_at`

Required for:
- auditability
- handling `pause`
- handling `cancel`
- distinguishing immediate cancellation from end-of-cycle cancellation

### `skip_next_cycle`, `is_trial`, `trial_ends_at`

Required for:
- the Admin list
- filtering
- future renewal logic

## 5. Data stored as JSON snapshots

The following data should be stored as JSON fields in the `subscription` model:

- `customer_snapshot`
- `product_snapshot`
- `pricing_snapshot`
- `shipping_address`
- `pending_update_data`
- `metadata`

## 6. Customer snapshot

Proposed shape:

```ts
{
  email: string
  full_name: string | null
}
```

Why:
- the Admin list/detail should remain readable even if customer data changes later
- subscription history should not fully depend on the current state of the customer record

## 7. Product snapshot

Proposed shape:

```ts
{
  product_id: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string | null
}
```

Why:
- Admin list/detail should show a stable view of the subscription
- changing a product or variant title should not break historical readability
- the snapshot simplifies list and detail rendering

## 8. Pricing snapshot

Proposed shape:

```ts
{
  discount_type: "percentage" | "fixed"
  discount_value: number
  label: string | null
}
```

Why:
- offer terms may change over time
- a subscription should preserve its own view of discount/offer data

## 9. Shipping address

`shipping_address` should be stored as a JSON snapshot.

Proposed shape:

```ts
{
  first_name: string
  last_name: string
  company: string | null
  address_1: string
  address_2: string | null
  city: string
  postal_code: string
  province: string | null
  country_code: string
  phone: string | null
}
```

Why:
- the subscription needs its own operational shipping address
- it should not depend on the customer’s global addresses
- future renewals should use the address assigned to the subscription

## 10. Pending update data

`pending_update_data` should be stored as JSON.

Proposed shape:

```ts
{
  variant_id: string
  variant_title: string
  sku: string | null
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  effective_at: string | null
  requested_at: string
  requested_by: string | null
}
```

Why:
- this is transitional state for a single subscription
- it does not require a separate entity at this stage
- it is easy to overwrite, clear, and render in Admin

## 11. Module links

Cross-module relations should be implemented through dedicated files in `src/links/`.

### Required links

- `subscription <-> customer`
- `subscription <-> product`
- `subscription <-> variant`

### Optional but recommended links for later growth

- `subscription <-> order`
- `subscription <-> cart`

## 12. Why both ID fields and links exist

The model stores:
- `customer_id`
- `product_id`
- `variant_id`

and also defines module links in parallel.

Why:
- ID fields simplify filtering and indexes
- links remain aligned with Medusa architecture and allow cross-module queries
- this is a practical compromise between architectural purity and query cost

## 13. Query implications

### `query.graph()` is enough for:

- detail by `id`
- list queries filtered by direct model fields:
  - `status`
  - `next_renewal_at`
  - `is_trial`
  - `skip_next_cycle`
  - `frequency_interval`
  - `frequency_value`

### `query.index()` may be needed for:

- filtering by linked `customer`
- filtering by linked `product`
- filtering by linked `variant`

At the same time, storing `customer_id`, `product_id`, and `variant_id` as plain fields reduces the need for `query.index()` in part of the Admin list use cases.

## 14. Target model

### Plain fields

```ts
id
reference
status
customer_id
product_id
variant_id
frequency_interval
frequency_value
started_at
next_renewal_at
last_renewal_at
paused_at
cancelled_at
cancel_effective_at
skip_next_cycle
is_trial
trial_ends_at
```

### JSON fields

```ts
customer_snapshot
product_snapshot
pricing_snapshot
shipping_address
pending_update_data
metadata
```

### Module links

```ts
subscription-customer
subscription-product
subscription-variant
subscription-order
subscription-cart
```

## 15. Impact on later steps

This model prepares the ground for:

1. `2.1.4`
   - implementation of the `subscription` module
2. `2.1.5`
   - module links
3. `2.1.6`
   - migrations and indexes
4. `2.1.7`
   - mutation workflows
