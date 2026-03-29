# Testing: Plans & Offers

This document describes the current testing strategy for the `Plans & Offers` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Plans & Offers` is designed to protect the plugin at the layers officially supported by Medusa's testing tooling.

The project currently relies on:
- module integration tests
- HTTP integration tests

It does not currently include browser-based UI tests.

## 1. Testing Strategy

The `Plans & Offers` area is tested in two main layers:

1. module/service layer
2. Medusa application integration layer

This gives coverage for:
- data model behavior
- service behavior
- effective config resolution
- query helpers
- workflows
- custom Admin API routes
- end-to-end backend flow used by the Admin UI
- cross-area integration with `Subscriptions`

This layer is the main protection for the implemented Admin behavior and the current subscription-offer integration boundary.

## 2. Test Tooling

The current setup uses Medusa-supported testing tools:
- `Jest`
- `@medusajs/test-utils`
- `moduleIntegrationTestRunner`
- `medusaIntegrationTestRunner`

Repository files involved in the setup:
- [package.json](../../package.json)
- [jest.config.js](../../jest.config.js)
- [integration-tests/setup.js](../../integration-tests/setup.js)
- [integration-tests/medusa-config.ts](../../integration-tests/medusa-config.ts)

## 3. Test Layers

### 3.1 Module Integration Tests

Purpose:
- verify the `planOffer` module service in isolation from full Admin flows

Current file:
- [service.spec.ts](../../src/modules/plan-offer/__tests__/service.spec.ts)

This layer is the right place for:
- service creation behavior
- service retrieval behavior
- module-level persistence behavior
- model-adjacent update behavior

### 3.2 HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- call real custom Admin routes
- execute workflows and query helpers against a running application
- verify behavior as used by the Admin UI

Current files:
- [plan-offers-workflows.spec.ts](../../integration-tests/http/plan-offers-workflows.spec.ts)
- [plan-offers-routes.spec.ts](../../integration-tests/http/plan-offers-routes.spec.ts)

Related integration coverage for cross-area behavior:
- [subscriptions-workflows.spec.ts](../../integration-tests/http/subscriptions-workflows.spec.ts)
- [subscriptions-routes.spec.ts](../../integration-tests/http/subscriptions-routes.spec.ts)

## 4. Fixture Strategy

Test data helpers are defined in:
- [plan-offer-fixtures.ts](../../integration-tests/helpers/plan-offer-fixtures.ts)
- [subscription-fixtures.ts](../../integration-tests/helpers/subscription-fixtures.ts)

Current helpers include:
- admin auth header creation
- product and variant creation
- plan offer seed creation
- subscription seed creation for integration scenarios

These helpers are used to:
- reduce duplication across integration tests
- keep route and workflow tests focused on behavior
- provide realistic source records and linked product context
- support smoke-level integration with `Subscriptions`

## 5. Current Coverage

### Module Coverage

Covered at the module/service layer:
- plan offer creation
- plan offer retrieval
- updates to scalar and JSON-backed fields
- updates to helper fields such as `frequency_intervals`

### Query and Workflow Coverage

Covered through integration tests:
- list query behavior
- detail query behavior
- effective config fallback behavior
- create or upsert workflow
- update workflow
- toggle workflow
- invalid frequency combinations
- product and variant mismatch validation
- discount range validation
- upsert behavior for an existing target

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/subscription-offers`
- `GET /admin/subscription-offers/:id`
- `POST /admin/subscription-offers`
- `POST /admin/subscription-offers/:id`
- `POST /admin/subscription-offers/:id/toggle`

This includes:
- success paths
- request validation failures
- domain validation failures
- filtered list behavior

### Admin Flow Coverage

The file [plan-offers-routes.spec.ts](../../integration-tests/http/plan-offers-routes.spec.ts) includes a scenario-style flow that covers:
- list
- create
- detail
- edit
- save
- refresh
- final value verification

This is not a browser test.

It is an integration-level backend flow using the same custom Admin endpoints used by the UI.

### Subscriptions Smoke-Check

The current test strategy also includes smoke-level integration with `Subscriptions`.

Covered behavior:
- subscription plan changes are allowed when an active offer exists for the target context
- requested frequency must match the active effective config
- plan changes are rejected when no active offer exists

The full smoke-level allow/block/no-active-offer coverage currently lives in:
- [subscriptions-routes.spec.ts](../../integration-tests/http/subscriptions-routes.spec.ts)

Related positive workflow-path coverage lives in:
- [subscriptions-workflows.spec.ts](../../integration-tests/http/subscriptions-workflows.spec.ts)

## 6. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run all module integration tests:

```bash
yarn test:integration:modules
```

Run a single HTTP test file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/plan-offers-routes.spec.ts
```

Run the query and workflow integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/plan-offers-workflows.spec.ts
```

Run the module test file:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/plan-offer/__tests__/service.spec.ts
```

## 7. What Is Intentionally Not Covered

The current test strategy does not include:
- Playwright
- browser-based Admin UI automation
- visual regression testing

Reason:
- the project currently follows the officially supported Medusa testing path based on `@medusajs/test-utils`
- the main Admin flow is validated through HTTP integration tests rather than browser automation

## 8. How to Add New Tests

Use this rule of thumb:

- add a module test when the behavior belongs to the module service itself
- add an HTTP integration test when the behavior depends on real routes, workflows, auth, or request validation
- extend the scenario flow when you want to protect a full operator flow across multiple endpoints
- extend the `Subscriptions` smoke-check when changes to offer semantics affect subscription plan changes

For new `Plans & Offers` functionality:
- prefer extending the existing `plan-offers-*` test files if the change matches their scope
- create a new focused test file only when the flow becomes large enough to deserve its own scenario

## 9. Practical Guidance for Future Contributors

When changing the `Plans & Offers` area:
1. update or add a module test if the service behavior changes
2. update or add an HTTP integration test if route behavior, validators, queries, or workflows change
3. update the scenario flow if the main Admin operator flow changes
4. update the `Subscriptions` smoke-check if effective config or plan-change behavior changes

If a feature changes the contract of:
- list filtering
- sorting
- effective config semantics
- mutation rules
- returned detail payload

then the corresponding integration tests should be updated in the same change set.

## 10. Summary

The `Plans & Offers` area is currently tested through Medusa-supported integration layers rather than browser automation.

This provides strong protection for:
- domain behavior
- effective config resolution
- workflow behavior
- Admin API contract
- the main Admin operator flow
- integration with `Subscriptions`

It does not attempt to validate rendering details in the browser.

## Related Documents

- [Docs Overview](../README.md)
- [Plans & Offers Architecture](../architecture/plan-offers.md)
- [Plans & Offers Admin API](../api/admin-plan-offers.md)
- [Plans & Offers Admin UI](../admin/plan-offers.md)
- [Roadmap](../roadmap/implementation-plan.md)
