# Reorder: Subscription Admin UI and API Spec

Ten dokument domyka krok `2.1.1` z `documentation/implementation_plan.md` i definiuje spec danych dla sekcji `Subscriptions` w Admin w sposób bliższy oficjalnym wzorcom Medusa.

Artefakty po tym kroku:
- typy Admin DTO: `reorder/src/admin/types/subscription.ts`
- ten dokument jako spec kolumn, akcji, filtrów i request shapes pod kolejne kroki

Uwaga:
- Medusa nie wymaga osobnego artefaktu `contract`.
- W praktyce framework używa kombinacji `types`, `Zod validators`, `WorkflowInput` i definicji UI route/DataTable.
- Ten dokument jest specyfikacją projektową, a nie frameworkowym bytem Medusy.

## 1. Admin DTO

Typy UI zostały przeniesione do:
- `SubscriptionAdminStatus`
- `SubscriptionFrequencyInterval`
- `SubscriptionAdminListItem`
- `SubscriptionAdminDetail`
- `SubscriptionAdminListResponse`
- `SubscriptionAdminDetailResponse`

Plik:
- `reorder/src/admin/types/subscription.ts`

## 2. Lista `Subscriptions`

Lista bazuje na `DataTable` i używa następujących kolumn:

| Kolumna | Domyślnie widoczna | Sortowalna | Uwagi |
|---|---:|---:|---|
| `subscription` | tak | tak | `reference` + stabilny identyfikator |
| `status` | tak | tak | badge statusu |
| `customer` | tak | tak | imię/nazwisko + email |
| `product` | tak | tak | produkt + wariant + opcjonalne SKU |
| `frequency` | tak | tak | np. `Every 2 months` |
| `next_renewal_at` | tak | tak | data kolejnego odnowienia |
| `trial` | tak | tak | flaga + `trial_ends_at` |
| `discount` | tak | tak | snapshot rabatu subskrypcyjnego |
| `skip_next_cycle` | tak | tak | boolean |
| `updated_at` | nie | tak | techniczna kolumna pomocnicza |

Minimalny rekord listy:
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

## 3. Statusy

Do MVP w Admin obowiązują statusy:
- `active`
- `paused`
- `cancelled`
- `past_due`

Uwagi:
- `cancelled` zostawiamy w brytyjskiej pisowni, bo taki status pojawia się już w planie i dokumentach produktu.
- `expired` nie wchodzi do kontraktu tego kroku, bo nie jest jeszcze częścią zakresu `Subscriptions` MVP.

## 4. Akcje wiersza / detail view

Zdefiniowane akcje:

| Akcja | Dozwolone statusy | Confirm | Cel |
|---|---|---:|---|
| `pause` | `active`, `past_due` | tak | wstrzymanie przyszłych odnowień |
| `resume` | `paused` | tak | wznowienie subskrypcji |
| `cancel` | `active`, `paused`, `past_due` | tak | zakończenie subskrypcji |
| `schedule_plan_change` | `active`, `paused`, `past_due` | nie | zaplanowanie zmiany wariantu/częstotliwości |
| `update_shipping_address` | `active`, `paused`, `past_due` | nie | aktualizacja adresu dostawy |

`cancelled` nie ma akcji mutacyjnych w MVP tego widoku.

## 5. Pola edycji

### 4.1 Schedule plan change

Pola:
- `plan_variant_id` - wymagane
- `frequency_interval` - wymagane, enum: `week | month | year`
- `frequency_value` - wymagane, liczba dodatnia
- `pending_change_effective_at` - opcjonalne ISO datetime

### 4.2 Update shipping address

Pola:
- `first_name` - wymagane
- `last_name` - wymagane
- `company` - opcjonalne
- `address_1` - wymagane
- `address_2` - opcjonalne
- `city` - wymagane
- `postal_code` - wymagane
- `province` - opcjonalne
- `country_code` - wymagane
- `phone` - opcjonalne

## 6. Filtry i sortowanie

Filtry listy:
- `q`
- `status[]`
- `customer_id`
- `product_id`
- `variant_id`
- `next_renewal_from`
- `next_renewal_to`
- `is_trial`
- `skip_next_cycle`

Sortowanie:
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

Kontrakt query listy:
- `limit`
- `offset`
- `order`
- `direction`
- wszystkie filtry powyżej

## 7. Payloady mutacji

Poniższe payloady są specem dla kolejnych kroków.
Ich implementacja powinna trafić do Zod validatorów w `src/api/admin/subscriptions/**/validators.ts` albo do plików middleware zgodnie z wzorcem Medusa.

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

Detail subskrypcji rozszerza rekord listy o:
- `created_at`
- `started_at`
- `paused_at`
- `cancelled_at`
- `last_renewal_at`
- `shipping_address`
- `pending_update_data`

`pending_update_data` przechowuje preview zaplanowanej zmiany planu:
- `variant_id`
- `variant_title`
- `frequency_interval`
- `frequency_value`
- `effective_at`

## 9. Konsekwencje dla następnych kroków

Ten kontrakt wymusza, żeby następny krok `2.1.2` zaprojektował co najmniej endpointy:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `POST /admin/subscriptions/:id/pause`
- `POST /admin/subscriptions/:id/resume`
- `POST /admin/subscriptions/:id/cancel`
- `POST /admin/subscriptions/:id/schedule-plan-change`
- `POST /admin/subscriptions/:id/update-shipping-address`
