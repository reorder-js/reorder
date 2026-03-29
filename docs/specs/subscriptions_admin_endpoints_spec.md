# Reorder: Subscription Admin Endpoints Spec

This document completes step `2.1.2` from `documentation/implementation_plan.md`.

Goal:
- design the backend endpoints for the `Subscriptions` Admin view
- stay as close as possible to official Medusa patterns

Reference Medusa patterns:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `validateAndTransformQuery(...)`
- `AuthenticatedMedusaRequest`
- `query.graph(...)`
- mutations as dedicated `POST` routes that execute workflows

## 1. Design rules

- All endpoints are under the `/admin` prefix, so they are automatically admin-only in Medusa.
- Route handlers use `AuthenticatedMedusaRequest`.
- Read endpoints use `query.graph()` or `query.index()` if filtering requires traversing linked modules.
- Mutation endpoints are a thin HTTP layer only:
  - request validation
  - workflow execution
  - return of a normalized response
- Business logic does not live in the route.

## 2. Endpoints

### 2.1 List subscriptions

- Method: `GET`
- Path: `/admin/subscriptions`
- Purpose: data source for the `DataTable` on the `Subscriptions` page

#### Query params

- `limit?: number`
- `offset?: number`
- `order?: string`
- `q?: string`
- `status?: string | string[]`
- `customer_id?: string`
- `product_id?: string`
- `variant_id?: string`
- `next_renewal_from?: string`
- `next_renewal_to?: string`
- `is_trial?: boolean`
- `skip_next_cycle?: boolean`

#### Response

```json
{
  "subscriptions": [],
  "count": 0,
  "limit": 20,
  "offset": 0
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformQuery(...)`
- Read model:
  - payload aligned with `SubscriptionAdminListResponse`
- Query:
  - prefer `query.graph()` if all filters are possible within this model
  - switch to `query.index()` if filtering by `customer`, `product`, or `variant` requires linked modules

### 2.2 Get subscription details

- Method: `GET`
- Path: `/admin/subscriptions/:id`
- Purpose: subscription detail view

#### Path params

- `id: string`

#### Response

```json
{
  "subscription": {}
}
```

#### Implementation notes

- Read model:
  - payload aligned with `SubscriptionAdminDetailResponse`
- Query:
  - `query.graph(...)`
- Error:
  - `404` if the subscription does not exist

### 2.3 Pause subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/pause`
- Purpose: stop future renewals

#### Body

```json
{
  "reason": "customer requested temporary stop",
  "effective_at": "2026-04-01T00:00:00.000Z"
}
```

#### Response

```json
{
  "subscription": {}
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `pauseSubscriptionWorkflow`

### 2.4 Resume subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/resume`
- Purpose: resume a paused subscription

#### Body

```json
{
  "resume_at": "2026-04-15T00:00:00.000Z",
  "preserve_billing_anchor": true
}
```

#### Response

```json
{
  "subscription": {}
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `resumeSubscriptionWorkflow`

### 2.5 Cancel subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/cancel`
- Purpose: cancel the subscription

#### Body

```json
{
  "reason": "retention flow failed",
  "effective_at": "end_of_cycle"
}
```

#### Response

```json
{
  "subscription": {}
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `cancelSubscriptionWorkflow`

### 2.6 Schedule plan change

- Method: `POST`
- Path: `/admin/subscriptions/:id/schedule-plan-change`
- Purpose: store `pending_update_data` for a future cycle

#### Body

```json
{
  "variant_id": "variant_123",
  "frequency_interval": "month",
  "frequency_value": 2,
  "effective_at": "2026-05-01T00:00:00.000Z"
}
```

#### Response

```json
{
  "subscription": {},
  "pending_update_data": {}
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `scheduleSubscriptionPlanChangeWorkflow`

### 2.7 Update shipping address

- Method: `POST`
- Path: `/admin/subscriptions/:id/update-shipping-address`
- Purpose: update the shipping address for future fulfillments

#### Body

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

#### Response

```json
{
  "subscription": {}
}
```

#### Implementation notes

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `updateSubscriptionShippingAddressWorkflow`

## 3. Proposed file structure

Target structure aligned with Medusa:

```text
reorder/src/api/admin/subscriptions/route.ts
reorder/src/api/admin/subscriptions/[id]/route.ts
reorder/src/api/admin/subscriptions/[id]/pause/route.ts
reorder/src/api/admin/subscriptions/[id]/resume/route.ts
reorder/src/api/admin/subscriptions/[id]/cancel/route.ts
reorder/src/api/admin/subscriptions/[id]/schedule-plan-change/route.ts
reorder/src/api/admin/subscriptions/[id]/update-shipping-address/route.ts
reorder/src/api/admin/subscriptions/validators.ts
reorder/src/api/admin/subscriptions/middlewares.ts
reorder/src/api/middlewares.ts
```

Notes:
- if validators become large, they can be split per route
- middleware can remain shared for the whole `subscriptions` namespace

## 4. Domain and HTTP errors

Minimum set expected in later steps:

- `404 Not Found`
  - subscription not found
- `400 Bad Request`
  - invalid payload / invalid query params
- `409 Conflict`
  - invalid status transition
  - pending update conflict
  - unsupported action for the current lifecycle state
- `422 Unprocessable Entity`
  - invalid shipping address
  - variant not eligible for subscription
  - invalid frequency configuration

## 5. Route -> responsibility mapping

| Route | Type | Logic layer |
|---|---|---|
| `GET /admin/subscriptions` | read | query/read model |
| `GET /admin/subscriptions/:id` | read | query/read model |
| `POST /admin/subscriptions/:id/pause` | mutation | workflow |
| `POST /admin/subscriptions/:id/resume` | mutation | workflow |
| `POST /admin/subscriptions/:id/cancel` | mutation | workflow |
| `POST /admin/subscriptions/:id/schedule-plan-change` | mutation | workflow |
| `POST /admin/subscriptions/:id/update-shipping-address` | mutation | workflow |

## 6. Impact on later steps

The next steps should now deliver:

1. `2.1.3`
   - mutation workflows for the five `POST` endpoints
2. `2.1.4`
   - Zod validators and middlewares
3. `2.1.5`
   - list/detail queries aligned with this specification
