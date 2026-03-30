# Test Data: Subscriptions Module

This document describes the public QA seed script for the `Subscriptions` area of the `Reorder` plugin.

It covers test data used across:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`

The current focus of the seeded scenarios is `Renewals`, but the script is intentionally named and structured more broadly so it can be extended for the whole module over time.

## Files

Seed script:
- [seed-subscriptions-test-data.ts](../../scripts/seed-subscriptions-test-data.ts)

Related runtime docs:
- [Subscriptions Testing](./subscriptions.md)
- [Renewals Testing](./renewals.md)
- [Renewals Admin UI](../admin/renewals.md)
- [Renewals Architecture](../architecture/renewals.md)

## Purpose

The script creates a small, repeatable QA dataset that makes it easier to manually test the plugin without building every record by hand.

It is intended for:
- local QA
- demo environments
- contributor setup
- plugin verification after reinstalling a store

## Execution Model

The script is designed to run through `medusa exec` in the context of a Medusa app that has the `reorder` plugin installed.

This is important because the script relies on:
- the Medusa container
- the plugin module services
- the store's real products and variants

It is not meant to be executed as a raw standalone database script.

## Requirements

Before running the script, make sure:
- your Medusa app is configured and migrations are applied
- the `reorder` plugin is installed in that app
- the store already has products with variants
- at least two products exist that don't already have `Plan Offers` assigned to them

Why the last requirement exists:
- the script intentionally avoids mutating existing `Plan Offers`
- it chooses clean product targets for QA scenarios

If your store does not meet these requirements, the script exits with a readable error instead of creating partial data.

## How to Run

Run the script from the root of your Medusa app.

Example for this repository layout:

```bash
cd my-medusa-store
npx medusa exec ../reorder/scripts/seed-subscriptions-test-data.ts
```

If your plugin repository lives in a different location, adjust the relative path accordingly.

## What the Script Creates

The script creates or updates:
- two `Plan Offers`
- multiple test subscriptions
- multiple renewal cycles
- one failed renewal attempt for history/detail testing

The seed is designed to be idempotent:
- it uses stable IDs
- rerunning it should update the same records instead of endlessly creating duplicates

## Current Scenarios

The current version creates these QA scenarios:

### 1. Renewal success without approval

Subscription reference:
- `SUB-QA-REN-SUCCESS`

Purpose:
- validate a clean `Force renewal` success path

Implementation note:
- the subscription uses `skip_next_cycle = true`
- this allows renewal success without requiring a real order creation flow

### 2. Paused subscription block

Subscription reference:
- `SUB-QA-REN-PAUSED`

Purpose:
- validate that renewals respect paused subscription state

### 3. Cancel-effective block

Subscription reference:
- `SUB-QA-REN-CANCEL-EFFECTIVE`

Purpose:
- validate that renewals are blocked when cancellation is already effective for the cycle date

### 4. Approval pending

Subscription reference:
- `SUB-QA-REN-APPROVAL-PENDING`

Purpose:
- validate `Approve changes`
- validate `Reject changes`
- validate `Approve -> Force renewal`

Implementation note:
- the subscription contains `pending_update_data`
- the selected active `Plan Offer` allows the updated cadence

### 5. Offer-policy blocked after approval

Subscription reference:
- `SUB-QA-REN-POLICY-BLOCKED`

Purpose:
- validate that renewal does not bypass active `Plans & Offers` policy

Implementation note:
- the subscription contains `pending_update_data`
- the active `Plan Offer` intentionally does not allow the updated cadence
- after approval, `Force renewal` should still be blocked by policy revalidation

### 6. Failed history / retry inspection

Subscription reference:
- `SUB-QA-REN-FAILED-HISTORY`

Purpose:
- validate failed cycle UI
- validate attempt history rendering
- validate failed renewal detail states

Implementation note:
- the seeded failure is based on missing `cart_id`
- the script also creates a failed `renewal_attempt` record for this scenario

## What the Script Does Not Create

The current version does not build a full checkout or order-generation setup.

This means:
- the success scenario is intentionally based on `skip_next_cycle = true`
- generated order summary may remain empty in seeded renewal records
- the script optimizes for operator-flow QA, not for full commerce checkout realism

If a future iteration needs richer end-to-end order creation test data, this script can be extended rather than replaced.

## How to Use the Seeded Data in Admin

After running the script:
1. open `Subscriptions -> Renewals`
2. search by the seeded references, for example:
   - `SUB-QA-REN-SUCCESS`
   - `SUB-QA-REN-APPROVAL-PENDING`
   - `SUB-QA-REN-POLICY-BLOCKED`
3. open the corresponding renewal cycle detail
4. run the manual QA scenarios described in the `Renewals` checklist

The script logs a scenario summary at the end of execution with:
- scenario name
- subscription reference
- renewal cycle ID
- short operator guidance

## Safety Notes

This script is intended for test and demo environments.

Although it tries to avoid clobbering unrelated data, it still creates and updates real records in the target store.

Recommended usage:
- local development stores
- dedicated QA environments
- disposable demo environments

Avoid running it on a production store.

## Extension Strategy

This file is intentionally broader than `Renewals`.

The expected future direction is to extend the same script with additional scenarios for:
- subscription lifecycle actions
- plan-change flows
- more advanced `Plans & Offers` coverage
- richer renewal execution and order-generation paths

This keeps test data generation in one public, discoverable place for the whole `Subscriptions` module.
