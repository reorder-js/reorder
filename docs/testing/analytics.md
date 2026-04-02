# Testing: Analytics

This document describes the current testing strategy for the `Analytics` area in the `Reorder` plugin.

It covers:
- test layers
- test files
- commands
- coverage scope
- fixture and scenario strategy
- known limitations

## Purpose

The Analytics testing setup is intended to protect:
- KPI calculation semantics
- trend and filter behavior
- snapshot rebuild behavior
- Admin analytics route contracts
- scenario-level Admin reporting flows

The project currently relies on:
- module integration tests
- Medusa HTTP integration tests

It does not currently include browser-based Admin automation.

## 1. Testing Strategy

The `Analytics` area is currently protected in four layers:

1. module-level read-model tests
2. rebuild workflow integration tests
3. Admin route integration tests
4. Admin flow integration tests

This split matches the same testing philosophy already used by the other plugin areas.

## 2. Test Tooling

The current setup uses:
- `Jest`
- `@medusajs/test-utils`
- `moduleIntegrationTestRunner`
- `medusaIntegrationTestRunner`

Repository files involved in the setup:
- [package.json](../../package.json)
- [jest.config.js](../../jest.config.js)
- [integration-tests/setup.js](../../integration-tests/setup.js)
- [integration-tests/medusa-config.ts](../../integration-tests/medusa-config.ts)

## 3. Current Test Files

### 3.1 Module Read-Model Tests

Current file:
- [admin-query.spec.ts](../../src/modules/analytics/__tests__/admin-query.spec.ts)

This layer covers:
- `MRR`
- `churn_rate`
- `LTV`
- `active_subscriptions_count`
- bucket grouping for `day`, `week`, and `month`
- filters for `status`, `product_id`, and `frequency`
- mixed-currency behavior
- empty dataset behavior
- invalid range and invalid frequency semantics

### 3.2 Rebuild Workflow Integration Tests

Current file:
- [analytics-workflows.spec.ts](../../integration-tests/http/analytics-workflows.spec.ts)

This layer covers:
- shared rebuild workflow for a day range
- idempotent reruns
- full replacement semantics
- partial failure handling
- manual rebuild route reuse of the same shared workflow

### 3.3 Admin API Route Tests

Current file:
- [subscription-analytics-routes.spec.ts](../../integration-tests/http/subscription-analytics-routes.spec.ts)

This layer covers:
- `GET /admin/subscription-analytics/kpis`
- `GET /admin/subscription-analytics/trends`
- `GET /admin/subscription-analytics/export`
- query validation
- defaults for `group_by` and `UTC`
- maximum window limit
- export payload consistency under active filters

### 3.4 Admin Flow Integration Tests

Current file:
- [subscription-analytics-admin-flow.spec.ts](../../integration-tests/http/subscription-analytics-admin-flow.spec.ts)

This layer covers:
- filtered KPI reads
- filtered trend reads
- export `CSV` and `JSON` on demand
- empty-result scenarios
- invalid-query scenarios
- confirmation that export does not replace or invalidate the display-read contract by itself

## 4. Fixture Strategy

Analytics tests reuse real recurring-commerce fixtures where possible.

The preferred strategy is:
- create subscriptions and related domain facts through existing helpers
- rebuild analytics snapshots through the shared workflow
- assert read behavior from the resulting `subscription_metrics_daily` dataset

This keeps the tests aligned with the real runtime boundaries of the feature.

## 5. Coverage Summary

### Read Model Coverage

Covered:
- KPI formulas
- bucket semantics
- filter semantics
- nullability for mixed-currency and insufficient revenue data
- empty dataset behavior

### Pipeline Coverage

Covered:
- range rebuild
- day-level replacement
- rerun idempotency
- partial failure summary
- manual rebuild workflow reuse

### Admin API Coverage

Covered:
- analytics read endpoints
- export endpoint
- validation defaults and limits
- export contract stability

### Admin Flow Coverage

Covered:
- KPI -> trends -> export scenario flow
- filter-driven reads
- empty and invalid-request scenarios

## 6. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run all module integration tests:

```bash
yarn test:integration:modules
```

Run analytics module tests:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/analytics/__tests__/admin-query.spec.ts
```

Run analytics workflow integration tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/analytics-workflows.spec.ts
```

Run analytics route integration tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-analytics-routes.spec.ts
```

Run analytics admin flow tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-analytics-admin-flow.spec.ts
```

## 7. Known Limitations

The current analytics testing strategy does not include:
- Playwright
- browser-based Admin component tests
- visual regression testing
- external monitoring or alerting verification

Important current limitation:
- the repository does not currently provide a `jsdom`-based Admin React test harness
- therefore `subscription-analytics-admin-flow.spec.ts` is implemented as an HTTP flow test, not a React component test

## 8. How to Extend Coverage

Use this rule of thumb:

- extend the module spec when KPI, bucket, or filter semantics change
- extend the workflow spec when snapshot rebuild semantics change
- extend the route spec when request validation or response contracts change
- extend the admin-flow spec when the expected operator flow changes

## 9. Summary

`Analytics` is currently protected at the layers that matter for this plugin:
- formula and read-model correctness
- rebuild-pipeline correctness
- Admin API contract correctness
- scenario-level Admin reporting flow correctness

This gives good protection for the implemented MVP analytics surface without adding unsupported browser tooling.
