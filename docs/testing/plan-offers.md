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
- Playwright E2E browser tests (for Admin UI)

## 1. Testing Strategy

The `Plans & Offers` area is tested in three main layers:

1. module/service layer
2. Medusa application integration layer
3. Playwright E2E browser testing layer
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

The current setup uses Medusa-supported testing tools alongside Playwright:
- `Jest`
- `@medusajs/test-utils`
- `moduleIntegrationTestRunner`
- `medusaIntegrationTestRunner`
- `@playwright/test`
Repository files involved in the setup:
- [package.json](../../package.json)
- [jest.config.js](../../jest.config.js)
- [integration-tests/setup.js](../../integration-tests/setup.js)
- [integration-tests/medusa-config.ts](../../integration-tests/medusa-config.ts)
- [playwright.config.ts](../../playwright.config.ts)
- [e2e/pages/PlanFormPage.ts](../../e2e/pages/PlanFormPage.ts)
- [e2e/plans-offers.spec.ts](../../e2e/plans-offers.spec.ts)

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

### 3.3 E2E Browser Tests (Playwright)

Purpose:
- run browser automation against a live Medusa Admin dashboard
- authenticate as admin via session-based auth (`storageState` cached in `e2e/.auth/admin.json`)
- seed test products via Admin API (`POST /admin/products`) for test data independence
- verify the plan offer creation flow via Page Object Model (`PlanFormPage`)
- intercept and validate the `POST /admin/subscription-offers` request payload
- assert UI success feedback and immediate display of the created plan in the data table

Current files:
- [auth.setup.ts](../../e2e/auth.setup.ts)
- [PlanFormPage.ts](../../e2e/pages/PlanFormPage.ts)
- [plans-offers.spec.ts](../../e2e/plans-offers.spec.ts)

This layer protects the actual operator experience in the browser, complementing backend integration flows.

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
### E2E Browser Coverage

Covered through Playwright browser tests:
- open plan creation modal from the list toolbar
- select product through the structured modal picker
- set frequency interval and value
- configure per-frequency discount (type and value)
- submit form via modal header action
- API intercept and payload validation for `POST /admin/subscription-offers`
- success toast notification (`Plan offer created`)
- data table search and visibility of newly created plan


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

Run Playwright E2E tests:

```bash
yarn test:e2e
```

Run only Plans & Offers E2E test:

```bash
npx playwright test e2e/plans-offers.spec.ts
```

## 7. What Is Intentionally Not Covered

The current test strategy does not include:
- visual regression testing / screenshot diffing
- edit drawer E2E flows in Playwright (scheduled for subsequent iterations)
- storefront browser testing (managed in the storefront workspace)

Reason:
- the initial Plans & Offers Playwright suite focuses on the critical offer creation path before expanding to full drawer edit and toggle flows
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

The `Plans & Offers` area is tested through Medusa-supported integration layers alongside Playwright browser automation for the Admin UI creation flow.

This provides strong protection for:
- domain behavior
- effective config resolution
- workflow behavior
- Admin API contract
- the main Admin operator flow
- browser-rendered Admin UI plan creation flow
- integration with `Subscriptions`

## Related Documents

- [Docs Overview](../README.md)
- [Plans & Offers Architecture](../architecture/plan-offers.md)
- [Plans & Offers Admin API](../api/admin-plan-offers.md)
- [Plans & Offers Admin UI](../admin/plan-offers.md)
- [Roadmap](../roadmap/implementation-plan.md)
