# Testing: Cancellation & Retention

This document describes the current testing strategy for the `Cancellation & Retention` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Cancellation & Retention` is designed to protect the plugin at the layers officially supported by Medusa's testing tooling.

The project relies on:
- HTTP integration tests
- Playwright browser E2E tests for the Admin cancellation workflow

## 1. Testing Strategy

The `Cancellation & Retention` area is currently tested at the Medusa application integration layer.

This gives coverage for:
- workflows
- custom Admin API routes
- Admin backend flows used by the UI
- smoke-level integration with `Subscriptions`, `Renewals`, and `Dunning`

## 2. Test Tooling

The current setup uses:
- `Jest`
- `@medusajs/test-utils`
- `medusaIntegrationTestRunner`
- `Playwright`

Repository files involved in the setup:
- [package.json](../../package.json)
- [jest.config.js](../../jest.config.js)
- [integration-tests/setup.js](../../integration-tests/setup.js)
- [integration-tests/medusa-config.ts](../../integration-tests/medusa-config.ts)

## 3. Automated Test Coverage

### HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- call the real custom Admin routes
- verify workflows, read models, and API behavior as used by the Admin UI

Current HTTP integration files:
- [cancellations-workflows.spec.ts](../../integration-tests/http/cancellations-workflows.spec.ts)
- [cancellations-routes.spec.ts](../../integration-tests/http/cancellations-routes.spec.ts)
- [cancellations-admin-flow.spec.ts](../../integration-tests/http/cancellations-admin-flow.spec.ts)
- [cancellations-smoke.spec.ts](../../integration-tests/http/cancellations-smoke.spec.ts)

This layer is the main protection for the implemented cancellation and retention behavior.

### Browser E2E Test

The focused Playwright scenario [cancellation-retention.spec.ts](../../e2e/cancellation-retention.spec.ts) seeds an active subscription and linked cancellation case with isolated timestamp-based references. It covers the Admin queue, detail actions, confirmation prompts, mutation payloads, toasts, final case outcomes, and linked subscription lifecycle state.

## 4. Fixture Strategy

Test data helpers are defined in:
- [cancellation-fixtures.ts](../../integration-tests/helpers/cancellation-fixtures.ts)
- [subscription-fixtures.ts](../../integration-tests/helpers/subscription-fixtures.ts)
- [renewal-fixtures.ts](../../integration-tests/helpers/renewal-fixtures.ts)
- [dunning-fixtures.ts](../../integration-tests/helpers/dunning-fixtures.ts)

Current helpers include:
- admin auth header creation
- subscription seed creation
- cancellation case seed creation
- retention offer event seed creation
- renewal cycle seed creation
- dunning case seed creation

These helpers are used to:
- reduce duplication across integration tests
- keep route and workflow tests focused on behavior
- provide realistic case, offer, subscription, renewal, and dunning setup
- support smoke-level integration across `Cancellation & Retention`, `Subscriptions`, `Renewals`, and `Dunning`

## 5. Current Coverage

### Workflow Coverage

Covered through integration tests:
- `start-cancellation-case` success path
- idempotent reuse or update of an existing active case
- duplicate active case guard
- `apply-retention-offer` success paths
- `apply-retention-offer` policy failures
- `finalize-cancellation` success path
- `finalize-cancellation` required-reason behavior
- `update-cancellation-reason` behavior

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/cancellations`
- `GET /admin/cancellations/:id`
- `POST /admin/cancellations/:id/apply-offer`
- `POST /admin/cancellations/:id/finalize`
- `POST /admin/cancellations/:id/reason`

This includes:
- success paths
- request validation failures
- domain validation failures
- filtered list behavior
- detail payload behavior

### Admin Flow Coverage

The file [cancellations-admin-flow.spec.ts](../../integration-tests/http/cancellations-admin-flow.spec.ts) covers the main scenario-style backend flows used by the Admin UI:
- list cancellation cases
- open case detail
- apply retention offer
- finalize cancellation
- refresh detail and list
- verify final state

This is not a browser test.

It is an integration-level flow test using Medusa-supported tooling and the same custom Admin endpoints used by the UI.

### Browser E2E Coverage

The Playwright scenario [cancellation-retention.spec.ts](../../e2e/cancellation-retention.spec.ts) covers:
- applying a pause retention offer and verifying the case outcome is `Paused` and the linked subscription is `Paused`
- finalizing cancellation with a free-text reason and `Price` category
- verifying the `Canceled` case outcome in the queue and `Cancelled` subscription lifecycle state
- intercepting `apply-offer` and `finalize` requests to assert the Admin UI sends the workflow contract

### Cross-Area Smoke Coverage

The file [cancellations-smoke.spec.ts](../../integration-tests/http/cancellations-smoke.spec.ts) protects the main runtime boundary with other plugin areas.

Covered behavior:
- pause retention updates subscription lifecycle to `paused`
- `next_renewal_at` is preserved for paused subscriptions
- future scheduled renewals are cleaned up consistently after pause or final cancel
- final cancel sets `cancel_effective_at` and clears `next_renewal_at`
- `past_due` subscriptions may still enter cancellation flow
- active `DunningCase` coexists with active cancellation flow without ownership overlap

This is intentionally a smoke-level integration check, not a full browser or system test.

## 6. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run the workflows integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/cancellations-workflows.spec.ts
```

Run the admin routes integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/cancellations-routes.spec.ts
```

Run the admin flow file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/cancellations-admin-flow.spec.ts
```

Run the smoke-check file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/cancellations-smoke.spec.ts
```

Run the focused browser E2E scenario against a running Medusa backend:

```bash
yarn test:e2e e2e/cancellation-retention.spec.ts --project=chromium
```

## 7. What Is Intentionally Not Covered

The current test strategy does not include:
- visual regression testing
- separate module-service tests under `src/modules/cancellation/__tests__`

Reason:
- HTTP integration coverage remains the primary protection for workflows, API contracts, and cross-module behavior
- the focused browser E2E scenario protects the operator UI path for applying offers and finalizing cancellations
- visual and module-service coverage do not currently add protection beyond the established integration boundaries

## 8. How to Add New Tests

Use this rule of thumb:

- add or extend an HTTP integration test when behavior depends on real routes, workflows, auth, validation, or linked Medusa modules
- add or extend the browser E2E scenario when an Admin queue, drawer, confirmation prompt, mutation payload, or operator-visible lifecycle state changes
- extend the smoke-check when changes affect the runtime boundary with `Subscriptions`, `Renewals`, or `Dunning`

For new `Cancellation & Retention` functionality:
- prefer extending the existing `cancellations-*` integration tests for backend behavior
- keep browser scenarios focused on complete operator workflows with self-contained SQL or Admin API fixtures

## 9. Practical Guidance for Future Contributors

When changing the `Cancellation & Retention` area:
1. update or add an HTTP integration test if route behavior, validators, queries, or workflows change
2. update the browser E2E scenario if the main Admin operator flow changes
3. update the smoke-check if cancellation semantics change at the boundary with `Subscriptions`, `Renewals`, or `Dunning`

If a feature changes the contract of:
- queue filtering
- queue sorting
- mutation rules
- returned detail payload
- lifecycle impact on subscription
- integration with renewals or dunning

then the corresponding integration tests should be updated in the same change set.

## 10. Summary

The `Cancellation & Retention` area is tested through Medusa-supported HTTP integration layers and a focused Playwright Admin UI scenario.

This provides strong protection for:
- cancellation and retention workflows
- Admin read and mutation routes
- end-to-end operator flows for pause retention and final cancellation
- the runtime integration boundary with `Subscriptions`, `Renewals`, and `Dunning`
