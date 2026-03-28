# Reorder: Subscription Domain Model Spec

Ten dokument domyka krok `2.1.3` z `documentation/implementation_plan.md`.

Cel:
- zaprojektować finalny model domenowy `Subscription`
- ustalić, które dane należą do własnego modułu
- ustalić, które dane trzymamy jako snapshot
- ustalić, które dane łączymy przez module links

Projekt jest oparty na wzorcach Medusa:
- custom module jako właściciel domeny
- cross-module relations przez `defineLink`
- snapshoty tylko tam, gdzie potrzebny jest stabilny odczyt Admin i historii

## 1. Założenia architektoniczne

- `Subscription` jest własną encją domenową w custom module `subscription`.
- Dane z innych modułów Medusy nie są modelowane jako bezpośrednie relacje w DML.
- Powiązania z encjami commerce są realizowane przez module links.
- Snapshoty przechowujemy tam, gdzie bieżący stan encji zewnętrznej nie powinien wpływać na historyczny lub operacyjny obraz subskrypcji.
- Pola potrzebne do filtrowania i sortowania w Admin powinny być przechowywane jawnie jako pola modelu, a nie tylko w `metadata` lub JSON.

## 2. Statusy

Na tym etapie domena `Subscription` obsługuje statusy:

- `active`
- `paused`
- `cancelled`
- `past_due`

Nie dodajemy teraz:
- `expired`
- `failed`

Powód:
- nie są częścią aktualnego zakresu `Subscriptions`
- `failed` lepiej pasuje do warstwy renewals/dunning
- `expired` można dodać później, jeśli lifecycle będzie tego wymagał

## 3. Pola własne modelu

Poniższe pola należą bezpośrednio do modelu `subscription` i powinny być przechowywane jako zwykłe kolumny:

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

## 4. Uzasadnienie pól własnych

### `reference`

Stabilny identyfikator do wyświetlania w Admin i obsługi operacyjnej.

### `status`

Pole potrzebne do:
- filtrowania listy
- walidacji przejść statusów
- sterowania dostępnymi akcjami w Admin

### `customer_id`, `product_id`, `variant_id`

Trzymamy je jawnie w modelu mimo planowanych module links.

Powód:
- upraszcza filtrowanie
- upraszcza indeksowanie
- upraszcza list/detail queries
- jest zgodne z praktyką Medusy dla modeli, które operacyjnie „należą do” innych encji

### `frequency_interval`, `frequency_value`

To rdzeń cadence/frequency i pola potrzebne do:
- listy Admin
- sortowania
- mutacji `schedule-plan-change`
- późniejszych renewals

### `started_at`, `next_renewal_at`, `last_renewal_at`

To podstawowe pola lifecycle i harmonogramu.

### `paused_at`, `cancelled_at`, `cancel_effective_at`

Potrzebne do:
- auditowalności
- obsługi `pause`
- obsługi `cancel`
- odróżnienia anulowania natychmiastowego od anulowania na koniec cyklu

### `skip_next_cycle`, `is_trial`, `trial_ends_at`

Potrzebne do:
- listy Admin
- filtrowania
- logiki przyszłych renewals

## 5. Dane przechowywane jako snapshot JSON

Poniższe dane powinny być trzymane jako pola JSON w modelu `subscription`:

- `customer_snapshot`
- `product_snapshot`
- `pricing_snapshot`
- `shipping_address`
- `pending_update_data`
- `metadata`

## 6. Snapshot customer

Proponowany shape:

```ts
{
  email: string
  full_name: string | null
}
```

Powód:
- Admin list/detail powinien pozostać czytelny nawet jeśli dane klienta ulegną zmianie
- historia subskrypcji nie powinna być całkowicie zależna od bieżącego stanu klienta

## 7. Snapshot product

Proponowany shape:

```ts
{
  product_id: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string | null
}
```

Powód:
- list/detail w Admin mają pokazywać stabilny obraz subskrypcji
- zmiana nazwy produktu lub wariantu nie powinna niszczyć czytelności historii
- snapshot upraszcza rendering listy i detalu

## 8. Snapshot pricing

Proponowany shape:

```ts
{
  discount_type: "percentage" | "fixed"
  discount_value: number
  label: string | null
}
```

Powód:
- warunki oferty mogą się zmieniać w czasie
- subskrypcja powinna zachować własny obraz rabatu/oferty

## 9. Shipping address

`shipping_address` przechowujemy jako JSON snapshot.

Proponowany shape:

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

Powód:
- subskrypcja ma własny operacyjny adres dostawy
- nie chcemy zależeć od globalnych adresów klienta
- przyszłe odnowienia powinny korzystać z adresu przypisanego do subskrypcji

## 10. Pending update data

`pending_update_data` przechowujemy jako JSON.

Proponowany shape:

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

Powód:
- to stan przejściowy pojedynczej subskrypcji
- nie wymaga osobnej encji na tym etapie
- jest łatwy do nadpisania, wyczyszczenia i wyświetlenia w Admin

## 11. Module links

Cross-module relations realizujemy przez osobne pliki w `src/links/`.

### Wymagane linki

- `subscription <-> customer`
- `subscription <-> product`
- `subscription <-> variant`

### Linki opcjonalne, ale zalecane na dalszy rozwój

- `subscription <-> order`
- `subscription <-> cart`

## 12. Dlaczego jednocześnie ID fields i links

Model przechowuje:
- `customer_id`
- `product_id`
- `variant_id`

oraz równolegle definiuje module links.

Powód:
- ID fields upraszczają filtrowanie i indeksy
- links pozostają zgodne z architekturą Medusy i umożliwiają pobieranie danych cross-module
- to praktyczny kompromis między czystością architektoniczną a kosztami query

## 13. Konsekwencje dla query

### `query.graph()` będzie wystarczające dla:

- detail po `id`
- listy filtrowanej po polach własnego modelu:
  - `status`
  - `next_renewal_at`
  - `is_trial`
  - `skip_next_cycle`
  - `frequency_interval`
  - `frequency_value`

### `query.index()` może być potrzebne dla:

- filtrowania po linked `customer`
- filtrowania po linked `product`
- filtrowania po linked `variant`

Jednocześnie przechowywanie `customer_id`, `product_id`, `variant_id` jako plain fields zmniejsza potrzebę użycia `query.index()` dla części przypadków listy Admin.

## 14. Model docelowy

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

## 15. Konsekwencje dla następnych kroków

Ten model przygotowuje grunt pod:

1. `2.1.4`
   - implementację modułu `subscription`
2. `2.1.5`
   - module links
3. `2.1.6`
   - migracje i indeksy
4. `2.1.7`
   - workflowy mutacyjne

