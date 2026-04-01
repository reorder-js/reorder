# Testing: Dunning

This document describes the current testing strategy for the `Dunning` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Dunning` is designed to protect the plugin at the layers officially supported by Medusa's testing tooling.

The project currently relies on:
- HTTP integration tests

It does not currently include browser-based UI tests.

## 1. Testing Strategy

The `Dunning` area is currently tested at the Medusa application integration layer.

This gives coverage for:
- workflows
- custom Admin API routes
- Admin backend flows used by the UI
- smoke-level integration with `Renewals` and `Subscriptions`

## 2. Test Tooling

The current setup uses Medusa-supported testing tools:
- `Jest`
- `@medusajs/test-utils`
- `medusaIntegrationTestRunner`

Repository files involved in the setup:
- [package.json](../../package.json)
- [jest.config.js](../../jest.config.js)
- [integration-tests/setup.js](../../integration-tests/setup.js)
- [integration-tests/medusa-config.ts](../../integration-tests/medusa-config.ts)

## 3. HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- call the real custom Admin routes
- verify workflows, scheduled processing, and API behavior as used by the Admin UI

Current files:
- [dunning-workflows.spec.ts](../../integration-tests/http/dunning-workflows.spec.ts)
- [dunning-routes.spec.ts](../../integration-tests/http/dunning-routes.spec.ts)
- [dunning-smoke.spec.ts](../../integration-tests/http/dunning-smoke.spec.ts)

This layer is the main protection for the implemented dunning behavior.

## 4. Fixture Strategy

Test data helpers are defined in:
- [dunning-fixtures.ts](../../integration-tests/helpers/dunning-fixtures.ts)
- [renewal-fixtures.ts](../../integration-tests/helpers/renewal-fixtures.ts)
- [subscription-fixtures.ts](../../integration-tests/helpers/subscription-fixtures.ts)

Current helpers include:
- admin auth header creation
- subscription seed creation
- renewal cycle seed creation
- dunning case seed creation
- dunning attempt seed creation
- default retry schedule seed

These helpers are used to:
- reduce duplication across integration tests
- keep route and workflow tests focused on behavior
- provide realistic case, attempt, and renewal setup
- support smoke-level integration across `Dunning`, `Renewals`, `Subscriptions`, and `Cancellation & Retention`

## 5. Current Coverage

### Workflow Coverage

Covered through integration tests:
- `start-dunning` success path
- idempotent update of an existing case for the same renewal cycle
- duplicate active case blocked
- `run-dunning-retry` recovery path
- `run-dunning-retry` temporary failure and reschedule path
- max-attempt exhaustion and unrecovered closure
- manual `mark-recovered`
- manual `mark-unrecovered`
- retry-schedule override
- dunning read-model query helpers

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/dunning`
- `GET /admin/dunning/:id`
- `POST /admin/dunning/:id/retry-now`
- `POST /admin/dunning/:id/mark-recovered`
- `POST /admin/dunning/:id/mark-unrecovered`
- `POST /admin/dunning/:id/retry-schedule`

This includes:
- success paths
- request validation failures
- domain validation failures
- filtered list behavior
- detail payload behavior

### Admin Flow Coverage

The file [dunning-routes.spec.ts](../../integration-tests/http/dunning-routes.spec.ts) covers the main scenario-style backend flows used by the Admin UI:
- list dunning cases
- open case detail
- retry now
- mark recovered
- mark unrecovered
- refresh detail and list
- verify final state

This is not a browser test.

It is an integration-level flow test using Medusa-supported tooling and the same custom Admin endpoints used by the UI.

### Cross-Area Smoke Coverage

The file [dunning-smoke.spec.ts](../../integration-tests/http/dunning-smoke.spec.ts) protects the main runtime boundary with other plugin areas.

Covered behavior:
- a qualifying failed renewal starts dunning
- successful payment recovery closes the case and restores the subscription to `active`
- unrecovered closure leaves the subscription in `past_due` and preserves the failed renewal outcome
- active dunning may coexist with cancellation handling on the same subscription without ownership overlap

This is intentionally a smoke-level integration check, not a full browser or system test.

The file [cancellations-smoke.spec.ts](../../integration-tests/http/cancellations-smoke.spec.ts) also protects a shared runtime boundary from the cancellation side.

Covered behavior there includes:
- `past_due` subscriptions may still enter cancellation and retention flows
- active `DunningCase` remains visible and does not get taken over by cancellation workflows

## 6. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run the workflows integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/dunning-workflows.spec.ts
```

Run the admin routes integration file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/dunning-routes.spec.ts
```

Run the smoke-check file:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/dunning-smoke.spec.ts
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

- add or extend an HTTP integration test when behavior depends on real routes, workflows, auth, validation, or linked Medusa modules
- add a scenario test when you want to protect a full operational Admin flow across multiple endpoints
- extend the smoke-check when changes affect the runtime boundary with `Renewals`, `Subscriptions`, or `Cancellation & Retention`

For new `Dunning` functionality:
- prefer extending the existing `dunning-*` test files if the change matches their scope
- create a new focused test file only when the flow becomes large enough to deserve its own scenario

## 9. Summary

The `Dunning` area is currently tested through Medusa-supported HTTP integration layers rather than browser automation.

This provides strong protection for:
- payment recovery workflows
- Admin read and mutation routes
- scenario-style operator flows
- the runtime integration boundary with `Renewals`, `Subscriptions`, and `Cancellation & Retention`
