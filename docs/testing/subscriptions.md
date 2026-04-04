# Testing: Subscriptions

This document describes the current testing strategy for the `Subscriptions` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Subscriptions` is designed to protect the plugin at the layers officially supported by Medusa's testing tooling.

The project currently relies on:
- module integration tests
- HTTP integration tests

It does not currently include browser-based UI tests.

## 1. Testing Strategy

The `Subscriptions` area is tested in two main layers:

1. module/service layer
2. Medusa application integration layer

This gives coverage for:
- data model behavior
- service behavior
- query helpers
- workflows
- custom Admin API routes
- end-to-end backend flow used by the Admin UI

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
- verify the `subscription` module service in isolation from full Admin flows

Current file:
- [service.spec.ts](../../src/modules/subscription/__tests__/service.spec.ts)

This layer is the right place for:
- service creation/update behavior
- module-level persistence behavior
- model-adjacent logic

### 3.2 HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- call the real custom Admin routes
- verify workflows and API behavior as used by the Admin UI

Current files:
- [subscriptions-routes.spec.ts](../../integration-tests/http/subscriptions-routes.spec.ts)
- [subscriptions-workflows.spec.ts](../../integration-tests/http/subscriptions-workflows.spec.ts)
- [subscriptions-admin-flow.spec.ts](../../integration-tests/http/subscriptions-admin-flow.spec.ts)

This layer is the main protection for the implemented Admin behavior.

## 4. Fixture Strategy

Test data helpers are defined in:
- [subscription-fixtures.ts](../../integration-tests/helpers/subscription-fixtures.ts)

Current helpers include:
- admin auth header creation
- product and variant creation
- subscription seed creation

These helpers are used to:
- reduce duplication across integration tests
- keep admin route tests focused on behavior
- provide realistic seed data for lifecycle and mutation flows

## 5. Current Coverage

### Module Coverage

Covered at the module/service layer:
- subscription creation
- subscription retrieval
- subscription updates through the module service

### Query and Workflow Coverage

Covered through integration tests:
- list query behavior
- detail query behavior
- pause workflow
- resume workflow
- cancel workflow
- schedule plan change workflow
- update shipping address workflow
- invalid state transitions

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `POST /admin/subscriptions/:id/pause`
- `POST /admin/subscriptions/:id/resume`
- `POST /admin/subscriptions/:id/cancel`
- `POST /admin/subscriptions/:id/schedule-plan-change`
- `POST /admin/subscriptions/:id/update-shipping-address`

Store checkout follow-up:
- `POST /store/carts/:id/subscribe` now exists as the dedicated subscription purchase route
- the route expects subscription metadata on the cart line item
- one-time checkout remains on standard Medusa cart completion

### Admin Flow Coverage

The file [subscriptions-admin-flow.spec.ts](../../integration-tests/http/subscriptions-admin-flow.spec.ts) covers the main end-to-end backend flow used by the Admin UI:
- list subscriptions
- open subscription detail
- pause
- resume
- schedule plan change
- edit shipping address
- cancel

This is not a browser test.

It is an integration-level flow test using Medusa-supported tooling and the same custom Admin endpoints used by the UI.

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
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscriptions-admin-flow.spec.ts
```

Run a single module test file:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/subscription/__tests__/service.spec.ts
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
- add a scenario test when you want to protect a full operational flow across multiple endpoints

For new `Subscriptions` functionality:
- prefer extending the existing `subscriptions-*` test files if the change matches their scope
- create a new focused test file only when the flow becomes large enough to deserve its own scenario

## 9. Practical Guidance for Future Contributors

When changing the `Subscriptions` area:
1. update or add a module test if the service behavior changes
2. update or add an HTTP integration test if route behavior, validators, or workflows change
3. update the scenario test if the main Admin operator flow changes

If a feature changes the contract of:
- list filtering
- sorting
- mutation rules
- returned detail payload

then the corresponding integration tests should be updated in the same change set.

## 10. Summary

The `Subscriptions` area is currently tested through Medusa-supported integration layers rather than browser automation.

This provides strong protection for:
- domain behavior
- workflow behavior
- Admin API contract
- the main Admin operational flow

It does not attempt to validate rendering details in the browser.
