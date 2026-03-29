# Reorder: Subscription Admin UI and API Spec

This document completes step `2.1.1` from `documentation/implementation_plan.md` and defines the data specification for the `Subscriptions` area in Admin in a way that is closer to official Medusa patterns.

Artifacts produced in this step:
- Admin DTO types: `reorder/src/admin/types/subscription.ts`
- this document as the specification for columns, actions, filters, and request shapes for later steps

Note:
- Medusa does not require a separate `contract` artifact
- in practice, the framework uses a combination of `types`, `Zod validators`, `WorkflowInput`, and UI route/DataTable definitions
- this document is a design specification, not a framework-level Medusa artifact

## 1. Admin DTO

The UI types were moved into:
- `SubscriptionAdminStatus`
- `SubscriptionFrequencyInterval`
- `SubscriptionAdminListItem`
- `SubscriptionAdminDetail`
- `SubscriptionAdminListResponse`
- `SubscriptionAdminDetailResponse`

File:
- `reorder/src/admin/types/subscription.ts`

## 2. `Subscriptions` list

The list is based on `DataTable` and uses the following columns:

| Column | Visible by default | Sortable | Notes |
|---|---:|---:|---|
| `subscription` | yes | yes | `reference` + stable identifier |
| `status` | yes | yes | status badge |
| `customer` | yes | yes | full name + email |
| `product` | yes | yes | product + variant + optional SKU |
| `frequency` | yes | yes | for example `Every 2 months` |
| `next_renewal_at` | yes | yes | next renewal date |
| `trial` | yes | yes | flag + `trial_ends_at` |
| `discount` | yes | yes | subscription discount snapshot |
| `skip_next_cycle` | yes | yes | boolean |
| `updated_at` | no | yes | technical helper column |

Minimal list record:
- `id`
- `reference`
- `status`
- `customer`
- `product`
- `frequency`
- `next_renewal_at`
- `trial`
- `discount`
- `skip_next_cycle`
- `updated_at`

## 3. Statuses

The MVP Admin statuses are:
- `active`
- `paused`
- `cancelled`
- `past_due`

Notes:
- `cancelled` remains in British spelling because that status is already used in the plan and product documents
- `expired` is not part of this step’s contract because it is not in the current `Subscriptions` MVP scope

## 4. Row actions / detail view actions

Defined actions:

| Action | Allowed statuses | Confirm | Purpose |
|---|---|---:|---|
| `pause` | `active`, `past_due` | yes | stop future renewals |
| `resume` | `paused` | yes | resume the subscription |
| `cancel` | `active`, `paused`, `past_due` | yes | terminate the subscription |
| `schedule_plan_change` | `active`, `paused`, `past_due` | no | schedule a variant/frequency change |
| `update_shipping_address` | `active`, `paused`, `past_due` | no | update the shipping address |

`cancelled` has no mutation actions in this MVP view.

## 5. Edit fields

### 5.1 Schedule plan change

Fields:
- `plan_variant_id` - required
- `frequency_interval` - required, enum: `week | month | year`
- `frequency_value` - required, positive number
- `pending_change_effective_at` - optional ISO datetime

### 5.2 Update shipping address

Fields:
- `first_name` - required
- `last_name` - required
- `company` - optional
- `address_1` - required
- `address_2` - optional
- `city` - required
- `postal_code` - required
- `province` - optional
- `country_code` - required
- `phone` - optional

## 6. Filters and sorting

List filters:
- `q`
- `status[]`
- `customer_id`
- `product_id`
- `variant_id`
- `next_renewal_from`
- `next_renewal_to`
- `is_trial`
- `skip_next_cycle`

Sorting:
- `created_at`
- `updated_at`
- `status`
- `customer_name`
- `customer_email`
- `product_title`
- `variant_title`
- `frequency_interval`
- `frequency_value`
- `next_renewal_at`
- `trial_ends_at`
- `discount_value`
- `skip_next_cycle`

List query contract:
- `limit`
- `offset`
- `order`
- `direction`
- all filters listed above

## 7. Mutation payloads

The payloads below are a specification for later steps.
Their implementation should be added to Zod validators in `src/api/admin/subscriptions/**/validators.ts` or middleware files following Medusa patterns.

### `pause`
```json
{
  "reason": "customer requested temporary stop",
  "effective_at": "2026-04-01T00:00:00.000Z"
}
```

### `resume`
```json
{
  "resume_at": "2026-04-15T00:00:00.000Z",
  "preserve_billing_anchor": true
}
```

### `cancel`
```json
{
  "reason": "retention flow failed",
  "effective_at": "end_of_cycle"
}
```

### `schedule_plan_change`
```json
{
  "variant_id": "variant_123",
  "frequency_interval": "month",
  "frequency_value": 2,
  "effective_at": "2026-05-01T00:00:00.000Z"
}
```

### `update_shipping_address`
```json
{
  "first_name": "Jan",
  "last_name": "Kowalski",
  "company": "ACME",
  "address_1": "Nowa 1",
  "address_2": null,
  "city": "Warszawa",
  "postal_code": "00-001",
  "province": "Mazowieckie",
  "country_code": "PL",
  "phone": "+48123123123"
}
```

## 8. Detail payload

Subscription detail extends the list record with:
- `created_at`
- `started_at`
- `paused_at`
- `cancelled_at`
- `last_renewal_at`
- `shipping_address`
- `pending_update_data`

`pending_update_data` stores a preview of the scheduled plan change:
- `variant_id`
- `variant_title`
- `frequency_interval`
- `frequency_value`
- `effective_at`

## 9. Impact on later steps

This contract means the next step `2.1.2` must design at least these endpoints:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `POST /admin/subscriptions/:id/pause`
- `POST /admin/subscriptions/:id/resume`
- `POST /admin/subscriptions/:id/cancel`
- `POST /admin/subscriptions/:id/schedule-plan-change`
- `POST /admin/subscriptions/:id/update-shipping-address`
