# Spec: E2E Test - Subscription Plan Creation

## TLDR & Overview
Specification for a Playwright E2E test verifying the core flow of creating a subscription plan (Plans & Offers) from the Medusa Admin panel. The scenario covers navigating to the plan management page, linking a new plan to an existing product/variant, setting a billing interval (e.g., monthly) and a discount, and saving the form. The primary goal is to ensure merchants can successfully configure a subscription offer, which is a critical path for the `@reorder` plugin.

## Proposed Architecture & Data Model
The test will be located in the `reorder/e2e/` directory (e.g., `plans-offers.spec.ts`). It will simulate merchant behavior in the Admin UI.

Key architectural decisions:
1. **Data Independence (API Seeding):** A `beforeEach` hook will use the Medusa API to seed a test product and variant before entering the UI. This ensures the test is independent and does not rely on external or pre-existing database states.
2. **Page Object Model (POM):** The test will utilize the POM pattern. UI interactions and locators (e.g., form inputs, dropdowns, save button) will be abstracted into a separate class (e.g., `PlanFormPage`). This prepares the foundation for future plan-related tests (edit, delete, error validation) and makes UI changes easier to maintain.
3. **API Verification:** In addition to verifying UI success toasts, the test will intercept the network request (`page.waitForRequest` or `waitForResponse`) to validate the payload sent to the backend, ensuring fields like discount and interval map correctly to the API request.

## Step-by-Step Implementation Plan

### Phase 1: Setup and POM Creation
- [ ] Create the POM class file (e.g., `e2e/pages/PlanFormPage.ts`) containing locators and form interaction methods.
- [ ] Create the main test file `reorder/e2e/plans-offers.spec.ts`.
- [ ] Implement the `beforeEach` script hitting the Medusa API (POST `/admin/products`) to seed a test product.
- [ ] Configure `beforeEach` navigation to the plan management page.

### Phase 2: Form Interaction (via POM)
- [ ] Click the "Create Plan" button.
- [ ] Locate and select the seeded product/variant in the dropdown.
- [ ] Set the subscription interval (e.g., input "1", select "Month").
- [ ] Set the optional discount (e.g., 10%).
- [ ] Click the "Save" button.

### Phase 3: Assertions (API + UI)
- [ ] Intercept the network request to the plan creation endpoint.
- [ ] Assert the request payload matches the submitted form data (product ID, interval, discount).
- [ ] Assert the success toast/alert appears in the UI.
- [ ] Assert redirection to the created plan's detail or list view.
- [ ] (Optional) Assert the newly created plan appears correctly in the data table.

## Verification & Testing
Verify the test by running the Playwright suite locally: `npx playwright test e2e/plans-offers.spec.ts --headed`. Use headed mode to observe the form filling process and ensure POM interactions map correctly to the Admin UI elements. Review logs in `test-results` if needed.