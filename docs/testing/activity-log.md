# Testing: Activity Log

This document describes the current testing strategy for the `Activity Log` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- fixture strategy
- coverage scope
- known non-goals

## Purpose

The testing setup for `Activity Log` is designed to protect the business-audit layer at the boundaries officially supported by Medusa's testing tooling.

The project currently relies on:
- module integration tests
- HTTP integration tests

It does not currently include browser-based UI automation.

## 1. Testing Strategy

The `Activity Log` area is tested in two main layers:

1. module and workflow-adjacent backend tests
2. Medusa application integration tests

This gives coverage for:
- event normalization
- dedupe semantics
- central append-only write behavior
- workflow-backed event emission
- custom Admin read routes
- scenario-style Admin flow verification

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
- verify normalization and central event creation behavior in isolation from full Admin flows

Current files:
- [normalize-log-event.spec.ts](../../src/modules/activity-log/__tests__/normalize-log-event.spec.ts)
- [create-subscription-log-event.spec.ts](../../src/modules/activity-log/__tests__/create-subscription-log-event.spec.ts)

This layer is the right place for:
- `dedupe_key` stability
- redaction of sensitive fields
- `changed_fields` construction
- idempotent create semantics
- compensation behavior

### 3.2 HTTP Integration Tests

Purpose:
- run a full Medusa application in test mode
- execute real workflows and custom Admin routes
- verify the same read contracts used by the Admin UI

Current files:
- [subscriptions-workflows.spec.ts](../../integration-tests/http/subscriptions-workflows.spec.ts)
- [renewals-workflows.spec.ts](../../integration-tests/http/renewals-workflows.spec.ts)
- [cancellations-workflows.spec.ts](../../integration-tests/http/cancellations-workflows.spec.ts)
- [subscription-logs-routes.spec.ts](../../integration-tests/http/subscription-logs-routes.spec.ts)
- [subscriptions-admin-flow.spec.ts](../../integration-tests/http/subscriptions-admin-flow.spec.ts)

This layer is the main protection for:
- workflow-backed event emission
- Admin list, detail, and timeline API contracts
- list -> detail -> timeline flow consistency

## 4. Fixture Strategy

Test data helpers reused by `Activity Log` coverage are defined in:
- [plan-offer-fixtures.ts](../../integration-tests/helpers/plan-offer-fixtures.ts)
- [renewal-fixtures.ts](../../integration-tests/helpers/renewal-fixtures.ts)
- [cancellation-fixtures.ts](../../integration-tests/helpers/cancellation-fixtures.ts)
- [dunning-fixtures.ts](../../integration-tests/helpers/dunning-fixtures.ts)

The `Activity Log` tests intentionally prefer:
- creating events through real workflows when possible
- using direct module creation only when the test focus is the read API itself

This keeps the tests focused and avoids unnecessary duplication of seed flows.

## 5. Current Coverage

### Module Coverage

Covered at the module layer:
- compact diff generation
- sensitive-data redaction
- metadata allow-listing
- date serialization in normalized payloads
- `dedupe_key` stability and differentiation
- central event creation without duplicates
- compensation behavior for created vs existing records

### Workflow and Backend Coverage

Covered through integration tests:
- `Subscriptions` event emission for:
  - pause
  - resume
  - cancel
  - schedule plan change
  - update shipping address
- payload correctness for those subscription events:
  - `event_type`
  - `reason`
  - `actor_type`
  - `changed_fields`
  - `metadata`
  - redaction of shipping-address sensitive fields

Additional coverage already exists in area-specific suites for:
- `Renewals` event emission and outcome logging
- `Cancellation & Retention` event emission and payload presence

### Admin API Coverage

Covered through HTTP integration tests:
- `GET /admin/subscription-logs`
- `GET /admin/subscription-logs/:id`
- `GET /admin/subscriptions/:id/logs`

This includes:
- filters
- sorting
- pagination
- detail payload retrieval
- timeline scoping
- `404` for missing detail records

### Admin Flow Coverage

The current flow-level coverage verifies:
- global list
- event detail
- subscription timeline
- consistency of one event across those three read paths

This is not a browser test.

It is an integration-level flow test using Medusa-supported tooling and the same Admin endpoints used by the UI.

## 6. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run all module integration tests:

```bash
yarn test:integration:modules
```

Run the activity-log route coverage:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-logs-routes.spec.ts
```

Run the subscription workflow coverage that asserts emitted logs:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscriptions-workflows.spec.ts
```

Run the activity-log module tests:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/activity-log/__tests__/normalize-log-event.spec.ts
```

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/activity-log/__tests__/create-subscription-log-event.spec.ts
```

## 7. What Is Intentionally Not Covered

The current strategy does not include:
- Playwright
- browser-based Admin automation
- visual regression testing
- archival or retention-job behavior

Reason:
- the project currently follows the officially supported Medusa testing path based on `@medusajs/test-utils`
- the current `Activity Log` implementation is validated through backend integration and Admin API flows

## 8. How to Add New Tests

Use this rule of thumb:

- add or extend a module test when changing normalization, redaction, or dedupe behavior
- add or extend an HTTP integration test when changing event emission, route contracts, filters, sorting, or timeline behavior
- extend an area-specific workflow suite when a new domain workflow emits a new activity-log event
- extend the route suite when the Admin read contract changes

## 9. Summary

`Activity Log` is currently protected at the layers that matter for this plugin:
- normalized event creation
- workflow-backed write behavior
- Admin read API behavior
- scenario-level read flow consistency

This gives good protection for the implemented audit-trail surface without introducing unsupported browser tooling.
