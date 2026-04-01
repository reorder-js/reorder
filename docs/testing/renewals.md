# Testing: Renewals

This document describes the current testing strategy for the `Renewals` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Renewals` is designed to protect the plugin at the layers officially supported by Medusa's testing tooling.

The project currently relies on:
- module integration tests
- HTTP integration tests

It does not currently include browser-based UI tests.

## 1. Testing Strategy

The `Renewals` area is tested in two main layers:

1. module/service layer
2. Medusa application integration layer

This gives coverage for:
- data model behavior
- service behavior
- query helpers
- workflows
- custom Admin API routes
- end-to-end backend flow used by the Admin UI
- smoke-level integration with `Subscriptions` and `Plans & Offers`

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
- verify the `renewal` module service in isolation from full Admin flows

Current file:
- [service.spec.ts](../../src/modules/renewal/__tests__/service.spec.ts)

This layer is the right place for:
- renewal cycle creation behavior
- renewal attempt creation behavior
- module-level persistence behavior
- model-adjacent service behavior

### 3.2 HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- call the real custom Admin routes
- verify workflows, scheduler-facing reads, and API behavior as used by the Admin UI

Current files:
- [renewals-workflows.spec.ts](../../integration-tests/http/renewals-workflows.spec.ts)
- [renewals-routes.spec.ts](../../integration-tests/http/renewals-routes.spec.ts)
- [renewals-admin-flow.spec.ts](../../integration-tests/http/renewals-admin-flow.spec.ts)
- [renewals-smoke.spec.ts](../../integration-tests/http/renewals-smoke.spec.ts)

This layer is the main protection for the implemented Admin behavior and the renewal execution boundary.

## 4. Fixture Strategy

Test data helpers are defined in:
- [renewal-fixtures.ts](../../integration-tests/helpers/renewal-fixtures.ts)
- [subscription-fixtures.ts](../../integration-tests/helpers/subscription-fixtures.ts)
- [plan-offer-fixtures.ts](../../integration-tests/helpers/plan-offer-fixtures.ts)

Current helpers include:
- admin auth header creation
- product and variant creation
- subscription seed creation
- renewal cycle seed creation
- renewal attempt seed creation
- plan offer seed creation

These helpers are used to:
- reduce duplication across integration tests
- keep route and workflow tests focused on behavior
- provide realistic seed data for approval, retry, and execution flows
- support smoke-level integration across `Renewals`, `Subscriptions`, `Plans & Offers`, and `Cancellation & Retention`

## 5. Current Coverage

### Module Coverage

Covered at the module/service layer:
- renewal cycle creation
- renewal attempt creation
- retrieval and persistence behavior for renewal records

### Query and Workflow Coverage

Covered through integration tests:
- list query behavior
- detail query behavior
- latest attempt summary resolution
- successful renewal execution
- failed renewal execution
- retry path after failure
- duplicate execution blocked
- already processing conflict
- approval required, approved, and rejected transitions
- force execution route and workflow behavior

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/renewals`
- `GET /admin/renewals/:id`
- `POST /admin/renewals/:id/force`
- `POST /admin/renewals/:id/approve-changes`
- `POST /admin/renewals/:id/reject-changes`

This includes:
- success paths
- request validation failures
- domain validation failures
- filtered list behavior
- approval decision flows

### Admin Flow Coverage

The file [renewals-admin-flow.spec.ts](../../integration-tests/http/renewals-admin-flow.spec.ts) covers the main scenario-style backend flows used by the Admin UI:
- list renewals
- open renewal detail
- approve changes
- reject changes
- force renewal
- refresh detail and list
- verify final state

This is not a browser test.

It is an integration-level flow test using Medusa-supported tooling and the same custom Admin endpoints used by the UI.

### Cross-Area Smoke Coverage

The file [renewals-smoke.spec.ts](../../integration-tests/http/renewals-smoke.spec.ts) protects the main integration boundary with other plugin areas.

Covered behavior:
- renewal respects subscription operational state
- renewal applies approved pending changes back to the subscription state
- renewal does not bypass active `Plans & Offers` policy
- qualifying renewal payment failure starts `Dunning`
- future renewal execution respects lifecycle effects coming from `Cancellation & Retention`

This is intentionally a smoke-level integration check, not a full browser or system test.

This smoke-check is the main protection for the renewal boundary with:
- subscription eligibility rules
- approved pending change materialization
- current offer-policy revalidation at execution time
- dunning startup after payment-qualified renewal failure
- cancellation-driven pause and cancel eligibility effects

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
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/renewals-admin-flow.spec.ts
```

Run the workflow integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/renewals-workflows.spec.ts
```

Run the smoke-check file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/renewals-smoke.spec.ts
```

Run the module test file:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/renewal/__tests__/service.spec.ts
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
- add an HTTP integration test when the behavior depends on real routes, workflows, auth, request validation, or linked Medusa modules
- add a scenario test when you want to protect a full operational Admin flow across multiple endpoints
- extend the smoke-check when changes affect integration with `Subscriptions`, `Plans & Offers`, or `Cancellation & Retention`

For new `Renewals` functionality:
- prefer extending the existing `renewals-*` test files if the change matches their scope
- create a new focused test file only when the flow becomes large enough to deserve its own scenario

## 9. Practical Guidance for Future Contributors

When changing the `Renewals` area:
1. update or add a module test if the service behavior changes
2. update or add an HTTP integration test if route behavior, validators, queries, workflows, or scheduler-facing behavior change
3. update the scenario flow if the main Admin operator flow changes
4. update the smoke-check if renewal semantics change at the boundary with `Subscriptions`, `Plans & Offers`, or `Cancellation & Retention`

If a feature changes the contract of:
- queue filtering
- queue sorting
- approval rules
- force-run rules
- returned detail payload
- renewal execution semantics

then the corresponding integration tests should be updated in the same change set.

## 10. Summary

The `Renewals` area is currently tested through Medusa-supported integration layers rather than browser automation.

This provides strong protection for:
- domain behavior
- workflow behavior
- Admin API contract
- the main Admin operational flow
- the integration boundary with `Subscriptions` and `Plans & Offers`

It does not attempt to validate rendering details in the browser.
