---
name: run-tests
description: Instructions for running and writing unit, integration, and Playwright E2E tests for the reorder plugin.
---

# Testing in Reorder

## Commands

```bash
# Backend integration tests (Jest)
yarn test:integration:http                        # All HTTP integration tests
yarn test:integration:modules                     # All module integration tests
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules jest --runInBand integration-tests/http/<file>.spec.ts

# Browser E2E tests (Playwright — requires running Medusa backend on :9000)
yarn test:e2e                                     # Full suite (seed -> auth -> chromium)
npx playwright test e2e/<file>.spec.ts            # Single spec
npx playwright test e2e/<file>.spec.ts --project=chromium  # Run spec reusing existing auth
npx playwright test e2e/<file>.spec.ts --headed   # Visual / headed mode
npx playwright test e2e/<file>.spec.ts --debug    # Step-by-step debugger
```

## Core Rules

1. **Run focused tests** for the affected area only.
2. **Self-contained fixtures**: Never depend on manual DB state or prior test runs. Seed in `beforeEach` with unique IDs (`Date.now()`).
3. **Doc sync**: If plugin behavior changes, keep `docs/` and tests aligned.

## Playwright E2E Conventions (`e2e/`)

- **Page Object Model**: Place reusable page classes in `e2e/pages/` (encapsulate locators, navigation, actions, and assertions).
- **Data Seeding**:
  - *Admin API* (`request.newContext()`): Seed catalog entities (products, variants) via Medusa API (`POST /admin/products`).
  - *Direct SQL* (`execFileSync("psql", [DB_URL, "-c", sql])`): Seed domain entities lacking Admin creation endpoints (`subscription`, `renewal_cycle`).
- **Mutation Pattern**:
  1. Set up `page.waitForResponse(...)` before triggering UI mutation.
  2. Trigger action (click button, submit modal, confirm prompt).
  3. Assert HTTP status (200) + request payload (`postDataJSON()`) or response body (`json()`).
- **UI Assertions**:
  - Toast visibility (`expect(page.getByText(...)).toBeVisible()`).
  - StatusBadge text transitions (`Active` -> `Paused`).
  - Modal / Drawer closes (`expect(modal).toBeHidden()`).
  - State-dependent menu items (assert presence of valid actions and absence of invalid ones).
