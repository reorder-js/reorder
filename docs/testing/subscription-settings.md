# Testing: Subscription Settings

This document describes the current testing strategy for the `Subscription Settings` area in the `Reorder` plugin.

It covers:
- test layers
- current test files
- runtime-effect coverage
- Admin flow coverage
- known limitations

## Purpose

The Settings testing setup is intended to protect:
- validation and normalization semantics
- fallback bootstrap behavior
- singleton update semantics
- optimistic locking
- runtime effects in renewals, dunning, and cancellation
- Admin API and scenario-level Admin flows

The project currently relies on:
- module integration tests
- Medusa HTTP integration tests

It does not currently include browser-based Admin automation.

## 1. Testing Strategy

The `Subscription Settings` area is currently protected in five layers:

1. module-level settings tests
2. workflow integration tests
3. Admin route integration tests
4. runtime-effect integration tests
5. Admin flow integration tests

This split matches the same general testing philosophy used by the other plugin areas.

## 2. Current Test Files

### 2.1 Module Tests

Current files:
- [normalize-settings.spec.ts](../../src/modules/settings/__tests__/normalize-settings.spec.ts)
- [service.spec.ts](../../src/modules/settings/__tests__/service.spec.ts)

This layer covers:
- validation and normalization
- fallback defaults
- `getSettings()`
- `updateSettings()`
- `resetSettings()`
- lazy-create singleton behavior
- persisted read semantics

### 2.2 Workflow Tests

Current file:
- [subscription-settings-workflows.spec.ts](../../integration-tests/http/subscription-settings-workflows.spec.ts)

This layer covers:
- optimistic locking through `expected_version`
- audit metadata append semantics
- rollback and compensation behavior
- restoration of previous persisted state after a failed workflow path

### 2.3 Admin API Route Tests

Current file:
- [subscription-settings-routes.spec.ts](../../integration-tests/http/subscription-settings-routes.spec.ts)

This layer covers:
- `GET /admin/subscription-settings`
- `POST /admin/subscription-settings`
- fallback defaults on read
- validation failures
- `409 conflict` for stale `expected_version`

### 2.4 Runtime-Effect Tests

Current file:
- [subscription-settings-runtime-effects.spec.ts](../../integration-tests/http/subscription-settings-runtime-effects.spec.ts)

This layer covers:
- `Dunning` reading settings for new `DunningCase` creation
- `Cancellation` snapshotting default behavior for new `CancellationCase`
- `Renewals` using settings at create time
- lack of retroactive rewriting of existing process state after later settings changes

### 2.5 Admin Flow Tests

Current file:
- [subscription-settings-admin-flow.spec.ts](../../integration-tests/http/subscription-settings-admin-flow.spec.ts)

This layer covers:
- `read -> edit -> save -> refresh`
- visible persisted update after save
- runtime effect after settings change through a representative `Dunning` flow
- confirmation that the settings read contract is stable across repeated Admin reads

## 3. Commands

Run all HTTP integration tests:

```bash
yarn test:integration:http
```

Run all module integration tests:

```bash
yarn test:integration:modules
```

Run settings module tests:

```bash
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand src/modules/settings/__tests__
```

Run settings workflow tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-settings-workflows.spec.ts
```

Run settings route tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-settings-routes.spec.ts
```

Run runtime-effect tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-settings-runtime-effects.spec.ts
```

Run Admin flow tests:

```bash
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules yarn jest --runInBand integration-tests/http/subscription-settings-admin-flow.spec.ts
```

## 4. Coverage Summary

### Module and Service Coverage

Covered:
- defaults and bootstrap fallback
- validation rules
- retry schedule normalization
- singleton persistence semantics

### Workflow Coverage

Covered:
- optimistic locking
- audit trail persistence
- rollback to fallback after failed create
- rollback to previous persisted state after failed update

### Admin API Coverage

Covered:
- effective settings read
- persisted update write
- invalid payload handling
- stale version conflict behavior

### Runtime Coverage

Covered:
- `Dunning` integration
- `Cancellation` integration
- `Renewals` create-time snapshot semantics

### Admin Flow Coverage

Covered:
- main operator flow for reading and saving settings
- persisted read-after-write behavior
- representative runtime effect after save

## 5. Known Limitations

The current Settings testing strategy does not include:
- Playwright
- browser-based Admin component tests
- visual regression testing
- permission or RBAC tests for future role-based access control

Important current limitation:
- the repository does not currently provide a `jsdom`-based Admin React test harness
- therefore `subscription-settings-admin-flow.spec.ts` is implemented as an HTTP flow test, not a React component test

## 6. How to Extend Coverage

Use this rule of thumb:

- extend the module specs when validation or defaults change
- extend the workflow spec when optimistic locking, audit, or rollback semantics change
- extend the route spec when request validation or response contracts change
- extend the runtime-effect spec when a new module starts consuming settings
- extend the admin-flow spec when the expected operator save flow changes

## 7. Summary

`Subscription Settings` are currently protected at the layers that matter for this plugin:
- module correctness
- workflow correctness
- Admin API correctness
- runtime integration correctness
- scenario-level Admin flow correctness

This gives good coverage for the implemented Settings MVP without adding unsupported browser tooling.
