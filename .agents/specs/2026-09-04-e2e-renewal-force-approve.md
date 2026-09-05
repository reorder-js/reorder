# Spec: E2E Playwright – Renewal Force Execution & Approval

## TLDR & Overview

Add a Playwright E2E test that exercises the merchant's "last resort" revenue recovery flow: navigate to the renewals queue, open a pending renewal cycle's detail page, and manually trigger force execution via the action dropdown. A second scenario covers the approval decision flow — opening the decision drawer, submitting an approval with a reason, confirming the prompt, and verifying the UI reflects the approved state.

This test validates that if the automated scheduler (cron) fails, a merchant can still manually charge the customer and generate an order through the Admin UI.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | POM or inline selectors? | **Create `RenewalDetailPage` POM** — the detail page has complex interactions (dropdown, drawer, prompt) and the POM will be reusable for future tests (reject, retry). Follows the existing pattern of `SubscriptionDetailPage` and `PlanFormPage`. |
| Q2 | Seed strategy (SQL vs Admin API)? | **Direct SQL insert via `psql`** — no Admin API exists for creating `renewal_cycle` records (they are created internally by the scheduler job). All existing E2E tests use this same pattern. Building a creation endpoint only for tests would add unnecessary API surface. Schema drift risk is low (model is mature) and any change fails the insert immediately (fail-fast). |
| Q3 | Verify attempt history? | **Yes** — after force execution, assert that the "Attempt history" section shows at least one attempt row (`#1`). This confirms the full execution pipeline ran, not just the status update. |
| Q4 | Seed for approval scenario? | **Direct seed with `approval_required = true, approval_status = 'pending'`** — gives full control over the initial state without depending on force-flow side effects. |
| Q5 | API payload verification? | **Yes** — use `waitForResponse` to intercept API calls and assert both the request payload (e.g. `reason` field sent) and response status (200). Follows the established pattern from `plans-offers.spec.ts` and `subscription-status.spec.ts`. |

## Proposed Architecture & Data Model

### New files

| File | Purpose |
|---|---|
| `e2e/pages/RenewalDetailPage.ts` | Page Object Model for the renewal detail page |
| `e2e/renewal-force.spec.ts` | E2E test: force renewal and approve pending changes |

### Page Object Model: `RenewalDetailPage`

```typescript
class RenewalDetailPage {
  constructor(page: Page) {}

  /** Navigate directly to the renewal detail page by cycle ID */
  async goto(renewalCycleId: string): Promise<void>

  /** Navigate via the renewals queue — search for a subscription reference, click matching row */
  async gotoFromQueue(subscriptionReference: string): Promise<void>

  /** Wait for the detail page to fully load (heading "Renewal cycle" visible) */
  async waitForLoaded(): Promise<void>

  /** Return the current cycle status text from the header StatusBadge */
  async getCycleStatusText(): Promise<string>

  /** Assert the header StatusBadge shows the expected cycle status */
  async expectCycleStatus(status: "Scheduled" | "Processing" | "Succeeded" | "Failed"): Promise<void>

  /** Open the action dropdown (EllipsisHorizontal icon button) */
  async openActionMenu(): Promise<void>

  /** Click "Force renewal" in the open dropdown menu */
  async clickForceRenewal(): Promise<void>

  /** Click "Approve changes" in the open dropdown menu */
  async clickApproveChanges(): Promise<void>

  /** Click "Reject changes" in the open dropdown menu */
  async clickRejectChanges(): Promise<void>

  /** Confirm the Medusa usePrompt confirmation dialog by clicking the confirm button */
  async confirmPrompt(confirmText: string): Promise<void>

  /** Assert a toast notification with the given text appears */
  async expectToast(text: string): Promise<void>

  /** Fill the reason textarea in the approval/rejection Drawer */
  async fillDecisionReason(reason: string): Promise<void>

  /** Click the submit button ("Approve" or "Reject") in the decision Drawer footer */
  async submitDecision(buttonText: "Approve" | "Reject"): Promise<void>

  /** Assert the Approval summary section shows the expected approval status badge */
  async expectApprovalStatus(status: "Pending" | "Approved" | "Rejected" | "Not required"): Promise<void>

  /** Assert a row exists in the Attempt history table with the given attempt number */
  async expectAttemptRow(attemptNo: number): Promise<void>
}
```

### Key UI elements and selectors (from source code analysis)

| Element | Selector strategy | Source reference |
|---|---|---|
| Renewals queue heading | `page.getByRole("heading", { name: "Renewals" })` | `page.tsx:256` — `<Heading level="h1">Renewals</Heading>` |
| Queue DataTable search | `page.getByPlaceholder(/search/i)` | DataTable built-in search input |
| Queue row (click navigates) | `page.getByRole("row")` rows — `onRowClick` navigates to `/subscriptions/renewals/${row.id}` | `page.tsx:201-203` |
| Detail heading text | `page.getByText("Renewal cycle")` | `page.tsx[id]:286` — `<Text>Renewal cycle</Text>` |
| Detail cycle ID heading | `page.getByRole("heading", { level: 1 })` | `page.tsx[id]:288` — `<Heading level="h1">{renewal.id}</Heading>` |
| Cycle status badge (header) | `StatusBadge` next to the action dropdown — text is `"Scheduled"` / `"Failed"` / `"Succeeded"` / `"Processing"` | `page.tsx[id]:295-297` |
| Action menu trigger | `IconButton` (small, transparent) — the `EllipsisHorizontal` icon | `page.tsx[id]:299-303` |
| "Force renewal" menu item | `page.getByRole("menuitem", { name: "Force renewal" })` or text `"Forcing..."` during mutation | `page.tsx[id]:314-316` |
| "Approve changes" menu item | `page.getByRole("menuitem", { name: "Approve changes" })` | `page.tsx[id]:326` |
| "Reject changes" menu item | `page.getByRole("menuitem", { name: "Reject changes" })` | `page.tsx[id]:336` |
| Force confirmation dialog title | `"Force renewal?"` | `page.tsx[id]:171` |
| Force confirmation button | Button with text `"Force renewal"` | `page.tsx[id]:174` |
| Force success toast | `"Renewal forced"` | `page.tsx[id]:80` |
| Approve confirmation dialog title | `"Approve changes?"` | `page.tsx[id]:208` |
| Approve confirmation button | Button with text `"Approve"` | `page.tsx[id]:214` |
| Approve success toast | `"Pending changes approved"` | `page.tsx[id]:102` |
| Reject success toast | `"Pending changes rejected"` | `page.tsx[id]:133` |
| Decision Drawer title | `"Approve changes"` or `"Reject changes"` | `page.tsx[id]:637` |
| Decision reason textarea | `page.getByLabel("Reason")` or `page.locator("#decision-reason")` | `page.tsx[id]:643-655` |
| Drawer submit button | `page.getByRole("button", { name: "Approve" })` or `{ name: "Reject" }` in the Drawer footer | `page.tsx[id]:683` |
| Drawer cancel button | `page.getByRole("button", { name: "Cancel" })` in the Drawer footer | `page.tsx[id]:666` |
| Approval summary section heading | `page.getByRole("heading", { name: "Approval summary" })` | `page.tsx[id]:386` |
| Approval status badge | `StatusBadge` inside the Approval summary section | `page.tsx[id]:393-395` |
| Attempt history section heading | `page.getByRole("heading", { name: "Attempt history" })` | `page.tsx[id]:452` |
| Attempt row number | `Text` with `#1`, `#2` etc. | `page.tsx[id]:472` |

### API endpoints intercepted

| Action | Method | URL pattern | Expected status | Payload assertion |
|---|---|---|---|---|
| Force renewal | POST | `**/admin/renewals/*/force` | 200 | Request body may contain `reason`; response contains `renewal.status` |
| Approve changes | POST | `**/admin/renewals/*/approve-changes` | 200 | Request body contains `reason: "Approved by E2E test"`; response contains `renewal.approval` |

### Confirmation prompt structure (from source code)

| Action | Dialog title | Confirm button text |
|---|---|---|
| Force renewal | "Force renewal?" | "Force renewal" |
| Approve changes | "Approve changes?" | "Approve" |
| Reject changes | "Reject changes?" | "Reject" |

### Seed strategy

Each test inserts a fresh `subscription` AND a linked `renewal_cycle` via `psql` in `beforeEach`. This mirrors the pattern from `subscription-status.spec.ts` and ensures full test isolation.

A shared `seedSubscriptionWithRenewalCycle(options)` helper encapsulates both inserts and accepts parameters:
- `approvalRequired: boolean` — controls `renewal_cycle.approval_required`
- `approvalStatus: string | null` — controls `renewal_cycle.approval_status`
- `cycleStatus: string` — controls `renewal_cycle.status` (default: `'scheduled'`)

Returns `{ subscriptionReference, renewalCycleId }` for navigation and assertions.

#### Scenario A: Force Renewal (cycle without approval)

Seeds a `renewal_cycle` with:
- `status = 'scheduled'`
- `approval_required = false`
- `approval_status = NULL`
- `scheduled_for` = past date (so the cycle is "due")

```sql
-- 1. Insert subscription
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
  '<sub_id>', 'SUB-E2E-RENEWAL-<ts>', 'active',
  'cus_e2e_renewal_<ts>', 'cart_e2e_renewal_<ts>',
  'prod_e2e_renewal_<ts>', 'variant_e2e_renewal_<ts>',
  'month', 1,
  '<now>', '<now+30d>',
  false, false,
  '{"email":"e2e-renewal@test.com","full_name":"E2E Renewal Test"}'::jsonb,
  '{"product_id":"prod_e2e","product_title":"E2E Renewal Product","variant_id":"var_e2e","variant_title":"Default","sku":"E2E-SKU-RENEWAL"}'::jsonb,
  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,
  '{"first_name":"E2E","last_name":"Renewal","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,
  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,
  '<now>', '<now>'
);

-- 2. Insert renewal_cycle linked to the subscription
INSERT INTO renewal_cycle (
  id, subscription_id, scheduled_for,
  status, approval_required, approval_status,
  attempt_count,
  created_at, updated_at
) VALUES (
  '<cycle_id>', '<sub_id>', '<now - 1 day>',
  'scheduled', false, NULL,
  0,
  '<now>', '<now>'
);
```

#### Scenario B: Approval Decision (cycle with pending approval)

Seeds a `renewal_cycle` with:
- `status = 'scheduled'`
- `approval_required = true`
- `approval_status = 'pending'`

```sql
INSERT INTO renewal_cycle (
  id, subscription_id, scheduled_for,
  status, approval_required, approval_status,
  attempt_count,
  created_at, updated_at
) VALUES (
  '<cycle_id>', '<sub_id>', '<now - 1 day>',
  'scheduled', true, 'pending',
  0,
  '<now>', '<now>'
);
```

### Test flows

#### Test 1: Force execution of a scheduled renewal cycle

```
 1. beforeEach: seed subscription + renewal_cycle (scheduled, no approval) via psql
 2. Navigate to /app/subscriptions/renewals (queue page)
 3. Wait for "Renewals" heading to confirm route loaded
 4. Search for seeded subscription reference in the DataTable search
 5. Click the matching row to navigate to the detail page
 6. Wait for the detail page heading to load
 7. Assert StatusBadge shows "Scheduled"

 === FORCE RENEWAL ===
 8. Set up API intercept: waitForResponse on POST .../admin/renewals/<id>/force
 9. Open the action dropdown (EllipsisHorizontal button)
10. Assert "Force renewal" menu item is visible
11. Click "Force renewal"
12. Confirm the "Force renewal?" prompt (click "Force renewal" button)
13. Assert API response status is 200
14. Assert API response body contains renewal object with updated status
15. Assert toast "Renewal forced" appears
16. Assert StatusBadge updates to "Succeeded" or "Failed" (depending on backend payment processing)
17. Assert "Attempt history" section now shows at least one attempt row (#1)
```

#### Test 2: Approve pending changes on a renewal cycle

```
 1. beforeEach: seed subscription + renewal_cycle (scheduled, approval_required=true, approval_status=pending) via psql
 2. Navigate to /app/subscriptions/renewals (queue page)
 3. Search for seeded subscription reference → click matching row → detail page
 4. Wait for detail page to load
 5. Assert StatusBadge shows "Scheduled"

 === APPROVE CHANGES ===
 6. Open the action dropdown
 7. Assert "Approve changes" menu item is visible
 8. Assert "Reject changes" menu item is visible
 9. Click "Approve changes"
10. Assert the Drawer opens with title "Approve changes"
11. Fill the reason textarea with "Approved by E2E test"
12. Set up API intercept: waitForResponse on POST .../admin/renewals/<id>/approve-changes
13. Click "Approve" button in the Drawer footer
14. Confirm the "Approve changes?" prompt (click "Approve" button)
15. Assert API response status is 200
16. Assert API request payload contains reason: "Approved by E2E test"
17. Assert toast "Pending changes approved" appears
18. Assert Drawer closes
19. Assert approval status in the "Approval summary" section shows "Approved"
20. Open action dropdown again → assert "Approve changes" and "Reject changes" menu items are absent (already decided)
21. Assert "Force renewal" menu item is still visible (cycle is still scheduled and forceable)
```

### State-dependent menu item visibility (from source code)

| Cycle state | "Force renewal" | "Approve changes" | "Reject changes" |
|---|---|---|---|
| `scheduled`, no approval | ✅ | ❌ | ❌ |
| `scheduled`, approval pending | ✅ | ✅ | ✅ |
| `scheduled`, approval approved | ✅ | ❌ | ❌ |
| `failed` | ✅ | ❌ | ❌ |
| `succeeded` | ❌ | ❌ | ❌ |
| `processing` | ❌ | ❌ | ❌ |

`canForce` = `status ∈ {scheduled, failed}` (line 46-49)
`canDecideApproval` = `approval.required && approval.status === "pending"` (line 150-153)

## Step-by-Step Implementation Plan

### Phase 1: Page Object Model

- [ ] Create `e2e/pages/RenewalDetailPage.ts`
- [ ] Implement constructor with all locator definitions (heading, status badge, action menu trigger)
- [ ] Implement `goto(id)` → navigate to `/app/subscriptions/renewals/${id}`
- [ ] Implement `gotoFromQueue(reference)` → go to `/app/subscriptions/renewals`, search, click row
- [ ] Implement `waitForLoaded()` → heading "Renewal cycle" visible
- [ ] Implement `getCycleStatusText()` and `expectCycleStatus()`
- [ ] Implement `openActionMenu()` → click the EllipsisHorizontal IconButton
- [ ] Implement `clickForceRenewal()`, `clickApproveChanges()`, `clickRejectChanges()`
- [ ] Implement `confirmPrompt(confirmText)` → click confirm button in the usePrompt dialog
- [ ] Implement `expectToast(text)`
- [ ] Implement `fillDecisionReason(reason)` → fill the `#decision-reason` textarea
- [ ] Implement `submitDecision(buttonText)` → click "Approve" or "Reject" in the Drawer footer
- [ ] Implement `expectApprovalStatus(status)` → assert the StatusBadge inside the Approval summary section
- [ ] Implement `expectAttemptRow(attemptNo)` → assert `#<n>` text is visible in Attempt history

### Phase 2: Test spec

- [ ] Create `e2e/renewal-force.spec.ts`
- [ ] Implement `seedSubscriptionWithRenewalCycle(options)` helper with `approvalRequired`, `approvalStatus`, `cycleStatus` params
- [ ] Implement `test.describe("Renewal force execution & approval")`

#### Test: "forces a scheduled renewal cycle"
- [ ] `beforeEach`: seed subscription + renewal_cycle (scheduled, no approval) via `execFileSync` + `psql`
- [ ] Navigate to queue → search → click row → detail page
- [ ] Assert initial status "Scheduled"
- [ ] Set up API intercept: `waitForResponse` on `POST .../force`
- [ ] Open action dropdown → click "Force renewal" → confirm "Force renewal?" prompt
- [ ] Assert API response 200 and response body contains `renewal.status`
- [ ] Assert toast "Renewal forced"
- [ ] Assert status badge updates (not "Scheduled" anymore)
- [ ] Assert attempt history shows row `#1`

#### Test: "approves pending changes on a renewal cycle"
- [ ] `beforeEach`: seed subscription + renewal_cycle (scheduled, approval_required, approval_status=pending) via `execFileSync` + `psql`
- [ ] Navigate to queue → search → click row → detail page
- [ ] Assert initial status "Scheduled"
- [ ] Open action dropdown → assert "Approve changes" and "Reject changes" visible
- [ ] Click "Approve changes" → Drawer opens with title "Approve changes"
- [ ] Fill reason "Approved by E2E test"
- [ ] Set up API intercept: `waitForResponse` on `POST .../approve-changes`
- [ ] Click "Approve" in Drawer footer → confirm "Approve changes?" prompt
- [ ] Assert API response 200 and request payload contains `reason: "Approved by E2E test"`
- [ ] Assert toast "Pending changes approved"
- [ ] Assert Drawer closes
- [ ] Assert approval summary shows "Approved"
- [ ] Open action dropdown → assert "Approve changes" absent, "Force renewal" still present

### Phase 3: Documentation update

- [ ] Update `docs/testing/renewals.md` — add section 3.3 for E2E Browser Coverage
- [ ] Document `renewal-force.spec.ts` scope and `RenewalDetailPage` POM
- [ ] Note the seed strategy (subscription + renewal_cycle via psql)

## Verification & Testing

Run locally against a live Medusa backend:

```bash
# Full E2E suite (includes seed + auth setup)
yarn test:e2e

# Only the new spec
npx playwright test e2e/renewal-force.spec.ts
```

### Success criteria

1. Force test: navigates the queue → detail page → forces the cycle → API returns 200 → toast "Renewal forced" → status badge changes from "Scheduled" → attempt history shows `#1`
2. Approve test: navigates the queue → detail page → opens approval drawer → fills reason → confirms → API returns 200 with correct request payload → toast "Pending changes approved" → Drawer closes → approval badge shows "Approved" → approval menu items disappear
3. API intercepts verify both request payloads and 200 responses for all mutations
4. Tests are fully isolated — each run creates unique subscription reference and renewal cycle, no dependency on prior state
5. `RenewalDetailPage` POM is reusable for future renewal E2E tests (reject scenario, failed retry, etc.)
