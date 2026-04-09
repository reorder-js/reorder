# Store Subscription Offers

This document describes the storefront read endpoint used by PDP to resolve subscription offer data from `Plans & Offers`.

## Endpoint

### `GET /store/products/:id/subscription-offer`

Returns the effective subscription offer for a product or variant.

Query params:
- `variant_id` optional

Response:
- `subscription_offer.is_subscription_available`
- `subscription_offer.product_id`
- `subscription_offer.variant_id`
- `subscription_offer.source_offer_id`
- `subscription_offer.source_scope`
- `subscription_offer.allowed_frequencies`
- `subscription_offer.discount_semantics`
- `subscription_offer.minimum_cycles`
- `subscription_offer.trial`

## Frequency payload

Each `allowed_frequencies` item contains:
- `frequency_interval`
- `frequency_value`
- `label`
- `discount`

`discount` contains:
- `type`
- `value`

## Resolution semantics

- variant-level offer takes precedence over product-level offer
- disabled or missing offer returns `is_subscription_available: false`
- cadence is returned in canonical backend form:
  - `week`
  - `month`
  - `year`

## Purpose

- PDP subscription selector
- PDP pricing and savings display
- storefront validation of allowed subscription cadence
