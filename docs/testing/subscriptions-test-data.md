# Test Data: Subscriptions Module

This document describes the public QA seed script for the `Subscriptions` area of the `Reorder` plugin.

It covers test data used across:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`

The current focus of the seeded scenarios is the operational QA surface around `Renewals` and `Dunning`, but the script is intentionally named and structured more broadly so it can be extended for the whole module over time.

## Files

Seed script:
- [seed-subscriptions-test-data.ts](../../scripts/seed-subscriptions-test-data.ts)

Reset script:
- [reset-subscriptions-test-data.ts](../../scripts/reset-subscriptions-test-data.ts)

Related runtime docs:
- [Subscriptions Testing](./subscriptions.md)
- [Renewals Testing](./renewals.md)
- [Dunning Testing](./dunning.md)
- [Renewals Admin UI](../admin/renewals.md)
- [Dunning Admin UI](../admin/dunning.md)
- [Renewals Architecture](../architecture/renewals.md)
- [Dunning Architecture](../architecture/dunning.md)

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

The reset script does not create or delete products.

So even after a successful reset, the seed still requires:
- products with variants to exist in the store
- at least two products without existing `Plan Offers`

## How to Run

Recommended flow:
1. reset previous QA seed data
2. run the seed again

Run the scripts from the root of your Medusa app.

Example for this repository layout:

```bash
cd my-medusa-store
npx medusa exec ../reorder/scripts/reset-subscriptions-test-data.ts
npx medusa exec ../reorder/scripts/seed-subscriptions-test-data.ts
```

If your plugin repository lives in a different location, adjust the relative path accordingly.

Seed only:

```bash
cd my-medusa-store
npx medusa exec ../reorder/scripts/seed-subscriptions-test-data.ts
```

Reset only:

```bash
cd my-medusa-store
npx medusa exec ../reorder/scripts/reset-subscriptions-test-data.ts
```

## What the Script Creates

The script creates or updates:
- two `Plan Offers`
- multiple test subscriptions
- multiple renewal cycles
- one failed renewal attempt for history/detail testing
- multiple dunning cases
- multiple dunning attempts

The reset script removes the seeded records for the same areas:
- seeded `Plan Offers`
- seeded `Subscriptions`
- seeded `RenewalCycle`
- seeded `RenewalAttempt`
- seeded `DunningCase`
- seeded `DunningAttempt`

The seed is designed to be idempotent:
- it uses stable IDs
- rerunning it should update the same records instead of endlessly creating duplicates

The reset is also deterministic:
- it targets only stable seeded IDs
- it additionally checks `metadata.seed_namespace = "subscriptions-test-data"`
- it removes records in child-to-parent order
- it also removes child `renewal_attempt` and `dunning_attempt` records linked to seeded root records, even if those child rows were created later during manual QA or workflow execution

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

### 7. Dunning queue: retry scheduled

Subscription reference:
- `SUB-QA-DUN-RETRY-SCHEDULED`

Purpose:
- validate the main queue view in `Subscriptions -> Dunning`
- validate provider and error-code filters
- validate `Retry now` from case detail

Implementation note:
- subscription is already in `past_due`
- dunning case is in `retry_scheduled`
- the case has `pp_stripe_stripe` and `card_declined`
- no dunning attempts exist yet, so the operator can test a first retry from clean queue state

### 8. Dunning detail: awaiting manual resolution

Subscription reference:
- `SUB-QA-DUN-AWAITING-MANUAL`

Purpose:
- validate the detail page layout
- validate failed-attempt timeline rendering
- validate `Mark recovered`
- validate `Mark unrecovered`

Implementation note:
- the case is in `awaiting_manual_resolution`
- one failed attempt is present with `requires_more`
- this scenario is intended for manual resolution actions rather than automatic retry scheduling

### 9. Dunning history: recovered

Subscription reference:
- `SUB-QA-DUN-RECOVERED`

Purpose:
- validate a terminal recovered detail page
- validate timeline with both failed and successful attempts
- validate list filtering for historical recovered cases

Implementation note:
- the subscription is back in `active`
- the case is closed as `recovered`
- the attempt timeline contains one failed attempt and one succeeded attempt

### 10. Dunning history: unrecovered

Subscription reference:
- `SUB-QA-DUN-UNRECOVERED`

Purpose:
- validate a terminal unrecovered detail page
- validate max-attempt exhaustion history
- validate filtering by provider, error code, and attempt count

Implementation note:
- the subscription remains in `past_due`
- the case is closed as `unrecovered`
- the timeline contains three failed attempts
- provider and error values are chosen to exercise queue filters

### 11. Dunning detail: manual retry-schedule override

Subscription reference:
- `SUB-QA-DUN-MANUAL-OVERRIDE`

Purpose:
- validate the retry-schedule drawer
- validate manual override state on detail
- validate filter combinations for active dunning work

Implementation note:
- the case is `retry_scheduled`
- `retry_schedule.source = manual_override`
- `max_attempts` and `intervals` differ from the default policy
- one failed attempt already exists to give the operator timeline context before overriding again

## What the Script Does Not Create

The current version does not build a full checkout or order-generation setup.

This means:
- the success scenario is intentionally based on `skip_next_cycle = true`
- generated order summary may remain empty in seeded renewal records
- seeded dunning records use real plugin modules and real linked renewal/subscription data, but they still do not create fully realistic commerce payment artifacts
- order summary coverage in Admin depends on whether the target store already has matching order records for seeded `renewal_order_id` values
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

For `Dunning`:
1. open `Subscriptions -> Dunning`
2. search or filter by the seeded references, for example:
   - `SUB-QA-DUN-RETRY-SCHEDULED`
   - `SUB-QA-DUN-AWAITING-MANUAL`
   - `SUB-QA-DUN-RECOVERED`
   - `SUB-QA-DUN-UNRECOVERED`
   - `SUB-QA-DUN-MANUAL-OVERRIDE`
3. verify queue filters:
   - `Provider id`
   - `Error code`
   - `Attempts min / max`
   - `Next retry from / to`
4. open case detail and manually validate:
   - timeline rendering
   - linked renewal summary
   - retry schedule section
   - `Retry now`
   - `Mark recovered`
   - `Mark unrecovered`
   - retry schedule override drawer

Recommended quick QA checklist for `Dunning`:
- `SUB-QA-DUN-RETRY-SCHEDULED`
  Verify queue visibility, `card_declined`, and `Retry now`.
- `SUB-QA-DUN-AWAITING-MANUAL`
  Verify manual resolution actions and failed attempt detail.
- `SUB-QA-DUN-RECOVERED`
  Verify historical recovered timeline and active subscription state.
- `SUB-QA-DUN-UNRECOVERED`
  Verify terminal unrecovered state and attempt-count filters.
- `SUB-QA-DUN-MANUAL-OVERRIDE`
  Verify `manual_override` retry schedule and drawer editing flow.

The script logs a scenario summary at the end of execution with:
- scenario name
- subscription reference
- renewal cycle ID
- dunning case ID when applicable
- short operator guidance

## Safety Notes

This script is intended for test and demo environments.

Although it tries to avoid clobbering unrelated data, it still creates and updates real records in the target store.

Recommended usage:
- local development stores
- dedicated QA environments
- disposable demo environments

Avoid running it on a production store.

The reset script is intentionally conservative:
- it only removes records created by this QA dataset
- it does not wipe unrelated subscription, renewal, dunning, product, or order data

Implementation detail:
- root records are matched by stable seed IDs plus `seed_namespace`
- child records are cleaned both by known seed IDs and by relational ownership under seeded `renewal_cycle` and `dunning_case` records

## Extension Strategy

This file is intentionally broader than `Renewals`.

The expected future direction is to extend the same script with additional scenarios for:
- subscription lifecycle actions
- plan-change flows
- more advanced `Plans & Offers` coverage
- richer renewal execution and order-generation paths
- richer payment-collection and order artifact coverage for `Dunning`

This keeps test data generation in one public, discoverable place for the whole `Subscriptions` module.
