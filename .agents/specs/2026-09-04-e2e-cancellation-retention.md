# Spec: E2E Test - Cancellation & Retention

## TLDR & Overview
This specification outlines a new Playwright End-to-End (E2E) UI test for the Admin dashboard. It verifies the Cancellation & Retention flow, ensuring the legal and business requirement of allowing permanent cessation of charges is fully functional. 

Since the Admin UI does not initiate the retention flow (the "Cancel" button on the Subscription Detail page performs a hard cancel), the test will seed an active cancellation case (simulating a storefront customer request). The test will cover two main scenarios: applying a retention offer (saving the subscription) and finalizing the cancellation (permanently stopping charges).

## Proposed Architecture & Data Model
- **Test File**: `e2e/cancellation-retention.spec.ts`
- **Page Object Models (POMs)**:
  - Create `e2e/pages/CancellationCaseDetailPage.ts` to interact with the case detail page (`/app/subscriptions/cancellations/[id]`) and its Action Drawer (the "retention modal").
  - Create `e2e/pages/CancellationsListPage.ts` to verify the case appears correctly in the main list.
- **Data Setup**:
  - Implement a `seedActiveCancellationCase()` function (using `psql` via `execFileSync`, similar to `seedActiveSubscription()`). It will seed an active subscription and a linked active cancellation case.

## Test Scenarios
1. **Apply Retention Offer (Pause)**: 
   - Admin opens an active cancellation case.
   - Admin applies a "Pause offer" (retention modal).
   - Verifies the toast `"Retention offer applied"` and that the case is marked as retained/closed, and the subscription is paused.
2. **Finalize Cancellation**:
   - Admin opens a fresh active cancellation case.
   - Admin chooses to "Finalize cancellation" in the retention modal.
   - Admin provides a free-text reason and selects a category (e.g., "Price").
   - Verifies the toast `"Cancellation finalized"`.
   - Verifies the case status is `Cancelled` on the list page (`/app/subscriptions/cancellations`).
   - Verifies the linked subscription's status is `Cancelled`.

## Step-by-Step Implementation Plan

### Phase 1: POMs and Seeding Setup
- [ ] Implement `seedActiveCancellationCase()` in `e2e/cancellation-retention.spec.ts` (seeds subscription + cancellation case).
- [ ] Create `e2e/pages/CancellationsListPage.ts` with locators for the table rows and search/filtering.
- [ ] Create `e2e/pages/CancellationCaseDetailPage.ts` with locators for:
  - Action dropdown trigger (`...`).
  - Drawer modes: `Apply retention offer`, `Finalize cancellation`.
  - Form fields: `offer-type`, `pause-cycles`, `finalize-reason`, `finalize-reason-category`.
  - Confirmation prompts and Toast assertions.

### Phase 2: E2E Scenarios Implementation
- [ ] **Scenario 1:** "applies a pause retention offer to an active case"
  - Setup: Seed case -> Navigate to list -> Click case row.
  - Action: Open "Apply retention offer" -> Select "Pause offer" -> Fill cycles -> Submit -> Confirm.
  - Assert: Toast `"Retention offer applied"`, Status badge changes to "Retained" or offer appears in timeline.
- [ ] **Scenario 2:** "finalizes cancellation when retention is rejected"
  - Setup: Seed case -> Navigate to list -> Click case row.
  - Action: Open "Finalize cancellation" -> Fill Reason textarea -> Select "Price" category -> Submit -> Confirm.
  - Assert: Toast `"Cancellation finalized"`.
  - Assert: Navigate to list page, verify the case shows final outcome.
  - Assert: Navigate to Subscription Detail page, verify main status badge is "Cancelled".

## Verification & Testing
- Run `yarn test:e2e e2e/cancellation-retention.spec.ts` locally.
- Ensure the database is completely isolated per test by using timestamp-based unique references in the seeding function.