# Spec: E2E Playwright – Subscription Pause & Resume

## TLDR & Overview

Add a Playwright E2E test that navigates to an active subscription's detail page, pauses it via the action dropdown, verifies the UI reflects "Paused" status, then resumes it and verifies the UI returns to "Active". This covers the most critical manual customer-support operations end-to-end in the browser.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | New file or append to existing? | **New file** `e2e/subscription-status.spec.ts` — detail-page mutations are a different concern from the list-page tests in `subscriptions-list.spec.ts` |
| Q2 | Create a POM? | **Yes** — `e2e/pages/SubscriptionDetailPage.ts` encapsulates detail-page locators and actions for reuse by future tests (cancel, plan change, address edit) |
| Q3 | Seed strategy | **Dedicated seed per test** — `beforeEach` inserts a fresh active subscription via direct SQL (same pattern as `seed.setup.ts`), guaranteeing `active` status regardless of prior test runs |
| Q4 | API verification | **Both** — `waitForResponse` intercepts confirm backend 200 + correct status in payload; UI assertions confirm frontend renders the new state |

## Proposed Architecture & Data Model

### New files

| File | Purpose |
|---|---|
| `e2e/pages/SubscriptionDetailPage.ts` | Page Object Model for the subscription detail page |
| `e2e/subscription-status.spec.ts` | E2E test: pause and resume an active subscription |

### Page Object Model: `SubscriptionDetailPage`

```typescript
class SubscriptionDetailPage {
  constructor(page: Page) {}

  /** Navigate directly to a subscription detail page by ID */
  async goto(subscriptionId: string): Promise<void>

  /** Navigate via list page — click first row matching the reference */
  async gotoFromList(reference: string): Promise<void>

  /** Wait for the detail page to fully load (heading visible) */
  async waitForLoaded(): Promise<void>

  /** Return the current status text from the header StatusBadge */
  async getStatusText(): Promise<string>

  /** Assert the header StatusBadge shows the expected status */
  async expectStatus(status: "Active" | "Paused" | "Cancelled" | "Past due"): Promise<void>

  /** Open the action dropdown (EllipsisHorizontal icon button) */
  async openActionMenu(): Promise<void>

  /** Click a named action in the open dropdown menu */
  async clickAction(name: "Pause" | "Resume" | "Cancel"): Promise<void>

  /** Confirm the Medusa usePrompt confirmation dialog */
  async confirmPrompt(confirmText: string): Promise<void>

  /** Assert a toast notification with the given text appears */
  async expectToast(text: string): Promise<void>

  /** Full action flow: open menu → click action → confirm → wait for toast */
  async executeAction(
    action: "Pause" | "Resume" | "Cancel",
    confirmText: string,
    toastText: string
  ): Promise<void>
}
```

### Key UI elements and selectors (from source code analysis)

| Element | Selector strategy |
|---|---|
| Detail page heading | `page.getByRole("heading", { name: /SUB-/ })` |
| Status badge (header) | `StatusBadge` next to the dropdown trigger — text content is `"Active"` / `"Paused"` / etc. |
| Action menu trigger | The `IconButton` (small, transparent) adjacent to the StatusBadge — contains `EllipsisHorizontal` icon |
| Dropdown menu items | `page.getByRole("menuitem", { name: "Pause" })` / `"Resume"` |
| Confirmation dialog title | `"Pause subscription?"` / `"Resume subscription?"` (from `getSubscriptionActionPromptConfig`) |
| Confirmation dialog button | Button with text `"Pause"` / `"Resume"` (the `confirmText` field) |
| Toast message | `page.getByText("Subscription paused")` / `page.getByText("Subscription resumed")` |

### API endpoints intercepted

| Action | Method | URL pattern | Expected status |
|---|---|---|---|
| Pause | POST | `**/admin/subscriptions/*/pause` | 200 |
| Resume | POST | `**/admin/subscriptions/*/resume` | 200 |

### Confirmation prompt structure (from `getSubscriptionActionPromptConfig`)

| Action | Dialog title | Confirm button text |
|---|---|---|
| Pause | "Pause subscription?" | "Pause" |
| Resume | "Resume subscription?" | "Resume" |

### Seed strategy

Each test run inserts a dedicated active subscription via `psql` in `beforeEach`, mirroring the pattern from `e2e/seed.setup.ts`:

```sql
INSERT INTO subscription (
  id, reference, status,
  customer_id, cart_id, product_id, variant_id,
  frequency_interval, frequency_value,
  started_at, next_renewal_at,
  skip_next_cycle, is_trial,
  customer_snapshot, product_snapshot, pricing_snapshot,
  shipping_address, payment_context,
  created_at, updated_at
) VALUES (
  gen_random_uuid()::text,
  'E2E-STATUS-<timestamp>', 'active',
  'cus_e2e_status_<ts>', 'cart_e2e_status_<ts>',
  'prod_e2e_status_<ts>', 'variant_e2e_status_<ts>',
  'month', 1,
  '<now>', '<now+30d>',
  false, false,
  '{"email":"e2e-status@test.com","full_name":"E2E Status Test"}'::jsonb,
  '{"product_id":"prod_e2e","product_title":"E2E Status Product","variant_id":"var_e2e","variant_title":"Default","sku":"E2E-SKU-STATUS"}'::jsonb,
  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,
  '{"first_name":"E2E","last_name":"Status","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,
  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,
  '<now>', '<now>'
);
```

The test then searches for this reference in the list page and navigates to the detail page via `gotoFromList(reference)`.

### Test flow

```
 1. beforeEach: seed fresh active subscription with unique reference via psql
 2. Navigate to /app/subscriptions → search for the seeded reference → click matching row
 3. Wait for detail page to load
 4. Assert StatusBadge shows "Active"

 === PAUSE ===
 5. Set up API intercept: waitForResponse on POST .../pause
 6. Open action dropdown → click "Pause"
 7. Confirm the "Pause subscription?" prompt (click "Pause" button)
 8. Assert API response status is 200
 9. Assert API response body contains status: "paused"
10. Assert toast "Subscription paused" appears
11. Assert StatusBadge updates to "Paused"
12. Open action dropdown → assert "Resume" menuitem visible, "Pause" menuitem absent
13. Close dropdown

 === RESUME ===
14. Set up API intercept: waitForResponse on POST .../resume
15. Open action dropdown → click "Resume"
16. Confirm the "Resume subscription?" prompt (click "Resume" button)
17. Assert API response status is 200
18. Assert API response body contains status: "active"
19. Assert toast "Subscription resumed" appears
20. Assert StatusBadge returns to "Active"
21. Open action dropdown → assert "Pause" menuitem visible, "Resume" menuitem absent
```

## Step-by-Step Implementation Plan

### Phase 1: Page Object Model

- [ ] Create `e2e/pages/SubscriptionDetailPage.ts`
- [ ] Implement constructor with all locator definitions
- [ ] Implement `goto(id)` and `gotoFromList(reference)` navigation methods
- [ ] Implement `waitForLoaded()`, `getStatusText()`, `expectStatus()`
- [ ] Implement `openActionMenu()`, `clickAction()`, `confirmPrompt()`
- [ ] Implement `expectToast()` and `executeAction()` convenience method

### Phase 2: Test spec

- [ ] Create `e2e/subscription-status.spec.ts`
- [ ] Implement `beforeEach` with dedicated subscription seed via `execSync` + `psql`
- [ ] Implement test: `pauses and resumes an active subscription`
- [ ] API intercepts via `page.waitForResponse` for both pause and resume POST requests
- [ ] API payload assertions: response status field matches expected state
- [ ] UI assertions: StatusBadge text transitions, toast messages, menu item presence/absence

### Phase 3: Documentation update

- [ ] Update `docs/testing/subscriptions.md` section 3.3 — add `subscription-status.spec.ts` to file list
- [ ] Update section 5 E2E Browser Coverage — add pause/resume status flow
- [ ] Document `SubscriptionDetailPage` POM alongside existing `PlanFormPage`

## Verification & Testing

Run locally against a live Medusa backend:

```bash
# Full E2E suite (includes seed + auth setup)
yarn test:e2e

# Only the new spec
npx playwright test e2e/subscription-status.spec.ts
```

### Success criteria

1. Test passes on a backend with a healthy database (seed creates its own subscription)
2. Pause action: StatusBadge transitions "Active" → "Paused", toast "Subscription paused" appears, API returns 200 with `status: "paused"`
3. Resume action: StatusBadge transitions "Paused" → "Active", toast "Subscription resumed" appears, API returns 200 with `status: "active"`
4. Menu items are state-appropriate after each transition: "Pause" visible only when active, "Resume" visible only when paused
5. Test is fully isolated — seeded subscription is unique per run, no dependency on prior test state
