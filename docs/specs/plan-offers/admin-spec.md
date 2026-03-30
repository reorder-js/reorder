# Reorder: Plans & Offers Admin UI and API Spec

This document covers step `2.2.1` from `documentation/implementation_plan.md`.

Goal:
- define Admin DTO types for `Plans & Offers`
- define the list/detail contract for an Admin `DataTable`
- define create/edit/toggle payloads for the next backend steps
- define a UX contract aligned with standard Medusa Admin patterns

Artifacts produced in this step:
- Admin DTO types: `reorder/src/admin/types/plan-offer.ts`
- this document as the specification for columns, actions, filters, and request/response shapes

Note:
- this is a design specification for later steps, not the final module implementation
- backend, workflows, and the Admin UI route will be implemented in later `2.2` steps

## 1. Design assumptions

`Plans & Offers` is an operational Admin view used to manage subscription offer configuration for a product or a variant.

At the contract level, we assume:
- one Admin record represents a configurable subscription offer
- an offer can be defined for `product` or `variant`
- `variant` has higher priority than `product`
- Admin must see both the source record and a compact effective-config summary

Following Medusa conventions:
- the list is based on `DataTable`
- read endpoints return paginated DTOs for the table and detail page
- mutations are exposed as dedicated `POST` routes
- the create flow should use `FocusModal`
- editing an existing record should use `Drawer`

## 2. Admin DTO

The UI types are defined as:
- `PlanOfferAdminStatus`
- `PlanOfferScope`
- `PlanOfferFrequencyInterval`
- `PlanOfferDiscountType`
- `PlanOfferAdminTarget`
- `PlanOfferAdminFrequencyOption`
- `PlanOfferAdminDiscountValue`
- `PlanOfferAdminRules`
- `PlanOfferAdminEffectiveConfigSummary`
- `PlanOfferAdminListItem`
- `PlanOfferAdminDetail`
- `PlanOfferAdminListResponse`
- `PlanOfferAdminDetailResponse`
- `CreatePlanOfferAdminRequest`
- `UpdatePlanOfferAdminRequest`
- `TogglePlanOfferAdminRequest`

File:
- `reorder/src/admin/types/plan-offer.ts`

## 3. List record shape

Minimal list record:
- `id`
- `name`
- `status`
- `is_enabled`
- `target`
- `allowed_frequencies`
- `discounts`
- `rules_summary`
- `effective_config_summary`
- `updated_at`

### `target`

The `target` field groups the data required to display the product or variant:

```ts
{
  scope: "product" | "variant"
  product_id: string
  product_title: string
  variant_id: string | null
  variant_title: string | null
  sku: string | null
}
```

Why:
- the table and detail view should render commerce data without requiring another shape
- the UI can render one consistent `product + variant` block

### `allowed_frequencies`

List of allowed billing frequencies:

```ts
Array<{
  interval: "week" | "month" | "year"
  value: number
  label: string
}>
```

Why:
- the UI needs both technical values and a ready-to-render label for badges or compact lists

### `discounts`

List of discounts assigned to frequencies:

```ts
Array<{
  type: "percentage" | "fixed"
  value: number
  label: string
}>
```

Note:
- the list DTO does not map discounts into an `interval -> value` object
- a list of records is simpler to render and easier to validate and sort on the API/UI side

### `effective_config_summary`

The Admin list/detail should immediately show where the final configuration comes from:

```ts
{
  source_scope: "product" | "variant"
  source_offer_id: string
  allowed_frequencies: PlanOfferAdminFrequencyOption[]
  discounts: PlanOfferAdminDiscountValue[]
  rules: PlanOfferAdminRules | null
}
```

Why:
- for `variant` records, the detail view can show the final source configuration without another request
- this will also support future integration with `Subscriptions`

## 4. Detail shape

The detail DTO extends the list record with:
- `created_at`
- `metadata`
- `rules`

The detail view should support:
- reviewing the full offer configuration
- edit flow in a `Drawer`
- future audit or integration sections

## 5. Statuses

At this stage, Admin only needs two visual states:
- `enabled`
- `disabled`

UI mapping:
- `enabled` -> green badge
- `disabled` -> grey badge

Note:
- the domain can still store `is_enabled: boolean`
- a separate DTO enum simplifies `StatusBadge` rendering and table contracts

## 6. `Plans & Offers` list

The list is based on `DataTable` and should expose the following columns:

| Column | Visible by default | Sortable | Notes |
|---|---:|---:|---|
| `name` | yes | yes | configuration name |
| `target` | yes | yes | product + variant + SKU |
| `scope` | yes | yes | `product` or `variant` |
| `status` | yes | yes | badge based on `is_enabled` |
| `allowed_frequencies` | yes | no | compact list or badges |
| `discounts` | yes | no | compact discount summary |
| `effective_source` | yes | yes | effective config source |
| `updated_at` | no | yes | technical helper column |

### Column rendering

`name`
- main record label

`target`
- first line: `product_title`
- second line: `variant_title` or `All variants`
- optional `SKU` as secondary text

`scope`
- text or badge: `Product override` / `Variant override`

`status`
- `StatusBadge`

`allowed_frequencies`
- badges or compact text such as `Every month`, `Every 2 months`

`discounts`
- badges or compact text such as `10% off`, `15% off`

`effective_source`
- indicates where the final configuration comes from:
  - `Product config`
  - `Variant config`

## 7. Actions

List/detail actions:

| Action | Available when | Confirm | Purpose |
|---|---|---:|---|
| `create` | always | no | create a new offer |
| `edit` | always | no | update an existing configuration |
| `enable` | when `disabled` | yes | enable the offer |
| `disable` | when `enabled` | yes | disable the offer |

Notes:
- `enable` and `disable` should be implemented via a `toggle` route with explicit `is_enabled`
- for consistency with Medusa action patterns, mutations should disable actions while pending

## 8. Form fields

### 8.1 Create flow

The create flow should be implemented with `FocusModal`.

Fields:
- `name` - required
- `scope` - required, enum: `product | variant`
- `product_id` - required
- `variant_id` - required only when `scope = variant`
- `is_enabled` - required
- `allowed_frequencies[]` - required, at least one entry
- `discounts[]` - optional, at most one discount per frequency
- `rules.minimum_cycles` - optional
- `rules.trial_enabled` - required inside the `rules` object
- `rules.trial_days` - optional, allowed only when trial is enabled
- `rules.stacking_policy` - required inside the `rules` object
- `metadata` - optional, not exposed as a main UI field in MVP

### 8.2 Edit flow

The edit flow should be implemented with `Drawer`.

Editable fields:
- `name`
- `is_enabled`
- `allowed_frequencies[]`
- `discounts[]`
- `rules.*`

Locked after creation:
- `scope`
- `product_id`
- `variant_id`

Why:
- changing the target on an existing record is regression-prone and semantically closer to creating a new configuration

## 9. Filters and sorting

List filters:
- `q`
- `is_enabled`
- `scope`
- `product_id`
- `variant_id`
- `frequency`

Filter meaning:
- `q` searches at least `name`, `product_title`, `variant_title`, and `sku`
- `is_enabled` filters by activation state
- `scope` separates product-level and variant-level configurations
- `product_id` and `variant_id` support precise narrowing
- `frequency` filters records that allow a given billing frequency

Sorting:
- `name`
- `scope`
- `status`
- `product_title`
- `variant_title`
- `updated_at`
- `created_at`

List query contract:
- `limit`
- `offset`
- `q`
- `is_enabled`
- `scope`
- `product_id`
- `variant_id`
- `frequency`
- `order`

Implementation note:
- `order` should stay aligned with Medusa list conventions, meaning a single field with an optional `-` prefix for descending order

## 10. API contract

### 10.1 List plan offers

- Method: `GET`
- Path: `/admin/subscription-offers`

#### Query params

- `limit?: number`
- `offset?: number`
- `q?: string`
- `is_enabled?: boolean`
- `scope?: "product" | "variant"`
- `product_id?: string`
- `variant_id?: string`
- `frequency?: string`
- `order?: string`

#### Response

```json
{
  "plan_offers": [],
  "count": 0,
  "limit": 20,
  "offset": 0
}
```

The payload matches `PlanOfferAdminListResponse`.

### 10.2 Get plan offer detail

- Method: `GET`
- Path: `/admin/subscription-offers/:id`

#### Response

```json
{
  "plan_offer": {}
}
```

The payload matches `PlanOfferAdminDetailResponse`.

### 10.3 Create plan offer

- Method: `POST`
- Path: `/admin/subscription-offers`

#### Body

```json
{
  "name": "Coffee monthly default",
  "scope": "product",
  "product_id": "prod_123",
  "variant_id": null,
  "is_enabled": true,
  "allowed_frequencies": [
    {
      "interval": "month",
      "value": 1
    },
    {
      "interval": "month",
      "value": 2
    }
  ],
  "discounts": [
    {
      "interval": "month",
      "value": 10,
      "type": "percentage"
    }
  ],
  "rules": {
    "minimum_cycles": 3,
    "trial_enabled": false,
    "trial_days": null,
    "stacking_policy": "disallow_subscription_discounts"
  },
  "metadata": null
}
```

#### Response

```json
{
  "plan_offer": {}
}
```

### 10.4 Update plan offer

- Method: `POST`
- Path: `/admin/subscription-offers/:id`

#### Body

`Partial<CreatePlanOfferAdminRequest>`

Example:

```json
{
  "name": "Coffee monthly default v2",
  "allowed_frequencies": [
    {
      "interval": "month",
      "value": 1
    },
    {
      "interval": "month",
      "value": 3
    }
  ],
  "discounts": [
    {
      "interval": "month",
      "value": 12,
      "type": "percentage"
    }
  ],
  "rules": {
    "minimum_cycles": 2,
    "trial_enabled": true,
    "trial_days": 14,
    "stacking_policy": "disallow_all"
  }
}
```

#### Response

```json
{
  "plan_offer": {}
}
```

### 10.5 Toggle plan offer

- Method: `POST`
- Path: `/admin/subscription-offers/:id/toggle`

#### Body

```json
{
  "is_enabled": false
}
```

#### Response

```json
{
  "plan_offer": {}
}
```

## 11. Domain errors

The next backend steps should prepare a consistent error contract.

Expected cases:
- `plan_offer_not_found`
- `invalid_scope_target`
- `variant_scope_requires_variant_id`
- `product_scope_disallows_variant_id`
- `duplicate_frequency`
- `discount_out_of_range`
- `discount_frequency_not_allowed`
- `invalid_trial_configuration`
- `conflicting_override_configuration`

## 12. UX and data loading

The view should follow Medusa Admin patterns:

- a dedicated Admin route with `DataTable`
- the list display query loads on mount
- a separate query for the create modal when products/variants must be fetched
- a separate query for the edit drawer when helper data is required
- invalidate the list query and detail query after mutations

UI states:
- loading: spinner or `DataTable` loading state
- empty: semantic empty state with a CTA to create the first offer
- error: `Alert` with a domain-oriented message
- pending mutations: disabled buttons and loading submit state

## 13. Impact on later steps

This contract means the next `2.2.x` steps must deliver:
- a domain module that stores the source offer record
- query helpers for list, detail, and effective config
- workflows for create, update, and toggle
- admin routes under `/admin/subscription-offers`
- an admin page with `DataTable`, `FocusModal` for create, and `Drawer` for edit
