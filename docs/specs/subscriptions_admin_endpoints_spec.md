# Reorder: Subscription Admin Endpoints Spec

Ten dokument domyka krok `2.1.2` z `documentation/implementation_plan.md`.

Cel:
- zaprojektować backend endpoints pod widok `Subscriptions` w Admin
- trzymać się możliwie blisko oficjalnych wzorców Medusa

Wzorce referencyjne Medusa:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `validateAndTransformQuery(...)`
- `AuthenticatedMedusaRequest`
- `query.graph(...)`
- mutacje jako osobne `POST` route'y wywołujące workflowy

## 1. Zasady projektowe

- Wszystkie endpointy są pod prefiksem `/admin`, więc są automatycznie chronione jako admin-only przez Medusę.
- Route handlers używają `AuthenticatedMedusaRequest`.
- Read endpoints używają `query.graph()` lub `query.index()` jeśli filtrowanie wymaga przejścia przez linkowane moduły.
- Mutacyjne endpointy są tylko cienką warstwą HTTP:
  - walidacja requestu,
  - wywołanie workflow,
  - zwrot znormalizowanej odpowiedzi.
- Logika biznesowa nie siedzi w route.

## 2. Endpointy

### 2.1 List subscriptions

- Method: `GET`
- Path: `/admin/subscriptions`
- Cel: źródło danych dla `DataTable` na stronie `Subscriptions`

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformQuery(...)`
- Read model:
  - payload zgodny z `SubscriptionAdminListResponse`
- Query:
  - prefer `query.graph()` jeśli wszystkie filtry są możliwe w obrębie tego modelu
  - przełącz na `query.index()` jeśli filtrowanie po `customer`, `product` albo `variant` będzie wymagało linkowanych modułów

### 2.2 Get subscription details

- Method: `GET`
- Path: `/admin/subscriptions/:id`
- Cel: detail view subskrypcji

#### Path params

- `id: string`

#### Response

```json
{
  "subscription": {}
}
```

#### Uwagi implementacyjne

- Read model:
  - payload zgodny z `SubscriptionAdminDetailResponse`
- Query:
  - `query.graph(...)`
- Błąd:
  - `404` jeśli subskrypcja nie istnieje

### 2.3 Pause subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/pause`
- Cel: zatrzymanie przyszłych odnowień

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `pauseSubscriptionWorkflow`

### 2.4 Resume subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/resume`
- Cel: wznowienie pauzowanej subskrypcji

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `resumeSubscriptionWorkflow`

### 2.5 Cancel subscription

- Method: `POST`
- Path: `/admin/subscriptions/:id/cancel`
- Cel: anulowanie subskrypcji

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `cancelSubscriptionWorkflow`

### 2.6 Schedule plan change

- Method: `POST`
- Path: `/admin/subscriptions/:id/schedule-plan-change`
- Cel: zapisanie `pending_update_data` na kolejny cykl

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `scheduleSubscriptionPlanChangeWorkflow`

### 2.7 Update shipping address

- Method: `POST`
- Path: `/admin/subscriptions/:id/update-shipping-address`
- Cel: aktualizacja adresu dostawy dla przyszłych realizacji

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

#### Uwagi implementacyjne

- Middleware:
  - `validateAndTransformBody(...)`
- Workflow:
  - `updateSubscriptionShippingAddressWorkflow`

## 3. Proponowana struktura plików

Docelowa struktura zgodna z Medusa:

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

Uwagi:
- jeśli walidatory zrobią się duże, można je rozbić per route
- middleware może zostać wspólny dla całego namespace `subscriptions`

## 4. Błędy domenowe i HTTP

Minimalny zestaw przewidziany na kolejne kroki:

- `404 Not Found`
  - subscription not found
- `400 Bad Request`
  - invalid payload / invalid query params
- `409 Conflict`
  - invalid status transition
  - pending update conflict
  - unsupported action for current lifecycle state
- `422 Unprocessable Entity`
  - invalid shipping address
  - variant not eligible for subscription
  - invalid frequency configuration

## 5. Mapowanie route -> odpowiedzialność

| Route | Typ | Warstwa logiki |
|---|---|---|
| `GET /admin/subscriptions` | read | query/read model |
| `GET /admin/subscriptions/:id` | read | query/read model |
| `POST /admin/subscriptions/:id/pause` | mutation | workflow |
| `POST /admin/subscriptions/:id/resume` | mutation | workflow |
| `POST /admin/subscriptions/:id/cancel` | mutation | workflow |
| `POST /admin/subscriptions/:id/schedule-plan-change` | mutation | workflow |
| `POST /admin/subscriptions/:id/update-shipping-address` | mutation | workflow |

## 6. Konsekwencje dla następnych kroków

Kolejne kroki powinny teraz wykonać:

1. `2.1.3`
   - workflowy mutacyjne dla 5 endpointów `POST`
2. `2.1.4`
   - Zod validators i middlewares
3. `2.1.5`
   - query pod list/details zgodne z tym specem

