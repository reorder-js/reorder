# Spec: Playwright E2E Testing PoC

## TLDR & Overview

Add the first Playwright end-to-end test to the Reorder plugin, covering the **Subscriptions Admin list page** — the project's most fundamental UI surface.

The PoC establishes the full Playwright infrastructure (config, auth setup, scripts, gitignore entries) and a single test file that exercises the subscriptions list page against a running local Medusa backend. It is intentionally narrow so the setup can be validated before scaling to more tests.

### Why the Subscriptions List Page?

The list page is the entry point to all subscription operations. It combines:
- data table rendering with real backend data
- search, filtering, sorting
- row actions (Pause / Resume / Cancel) with confirmation prompts
- navigation to detail pages

This gives a representative cross-section of UI interactions without requiring complex multi-step data setup.

### What the PoC does NOT include

- Storefront tests (separate project, separate concern)
- Detail page drawer flows (good second test, after PoC is validated)
- Mocking or stubbing backend data (tests run against the real running backend)
- CI pipeline integration (local-first; CI can come later)

## Open Questions

- Q1: Where should the Playwright tests live? Proposal: `reorder/e2e/` at project root, separate from the Jest-based `integration-tests/`. This keeps the two test frameworks isolated and avoids config conflicts. Alternative: `reorder/integration-tests/e2e/`.
- Q2: Should we install Playwright as a devDependency in `reorder/package.json`, or keep it standalone in a separate `e2e/package.json`? Proposal: devDependency in root `package.json` — simpler, one `yarn` install, consistent with existing Jest setup. The downside is it adds ~3MB to the plugin's devDependencies.
- Q3: The local environment has one subscription (SUB-1, active, monthly, Medusa T-Shirt). The PoC test will assert against this existing data. Should we add an API-based seed/teardown fixture in `globalSetup` to make the test self-contained, or is relying on existing data acceptable for a PoC? Proposal: for the PoC, rely on existing data (the test asserts that *at least one* subscription row is visible, not a specific count). Self-contained fixtures can be added in the next iteration.
- Q4: Admin login — the test needs to authenticate. Medusa Admin uses session-based auth at `POST /auth/user/emailpass`. The PoC will use a `storageState` approach: a global setup script logs in once, saves cookies to a file, and all tests reuse it. This avoids logging in per-test. Good approach?

## Proposed Architecture

### File layout

```
reorder/
├── e2e/
│   ├── auth.setup.ts          # Global setup: login, save storageState
│   ├── subscriptions-list.spec.ts  # PoC test
│   └── fixtures/
│       └── auth.ts            # Reusable auth helpers if needed later
├── playwright.config.ts       # Playwright configuration
```

### Playwright config highlights

- `baseURL`: `http://localhost:9000` (Medusa backend serves admin at `/app`)
- `projects`: one `setup` project for auth, one `chromium` project depending on setup
- `storageState`: saved to `e2e/.auth/admin.json` (gitignored)
- `testDir`: `./e2e`
- `retries`: 0 (PoC, local only)
- `use.trace`: `on-first-retry` (for debugging)
- No `webServer` — assumes backend is already running via `local-dev` skill

### Auth setup flow

1. Navigate to `http://localhost:9000/app/login`
2. Fill email + password (`admin@medusa-test.com` / `supersecret`)
3. Click "Sign in"
4. Wait for redirect to `/app` (dashboard)
5. Save `storageState` to `e2e/.auth/admin.json`

### Test: Subscriptions List Page

```
Test: "Subscriptions list page"
  ✓ should display the page heading and description
  ✓ should render the data table with expected columns
  ✓ should display at least one subscription row
  ✓ should support search by reference
  ✓ should open subscription detail on row click
  ✓ should show row action menu with status-appropriate options
```

Each assertion maps directly to documented UI behavior in `docs/admin/subscriptions.md`.

## Step-by-Step Implementation Plan

### Phase 1: Infrastructure
- [ ] Install `@playwright/test` as devDependency
- [ ] Install Playwright browsers (`npx playwright install chromium`)
- [ ] Create `playwright.config.ts`
- [ ] Create `e2e/auth.setup.ts`
- [ ] Add gitignore entries (`e2e/.auth/`, `playwright-report/`, `test-results/`)
- [ ] Add npm script `test:e2e` to `package.json`

### Phase 2: PoC Test
- [ ] Create `e2e/subscriptions-list.spec.ts` with the test cases above

### Phase 3: Validation
- [ ] Run `yarn test:e2e` against running local backend
- [ ] Verify all assertions pass
- [ ] Verify `storageState` auth reuse works

## Verification & Testing

The PoC is self-verifying: `yarn test:e2e` must pass with 0 failures. Visual confirmation via `npx playwright show-report` after the run.
