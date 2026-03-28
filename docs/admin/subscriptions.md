# Admin UI: Subscriptions

This document describes the implemented Admin UI for the `Subscriptions` area in the `Reorder` plugin.

It focuses on screen behavior, user flows, actions, and UI state handling.

## Purpose

The `Subscriptions` Admin UI gives operators a dedicated workspace to:
- browse subscriptions
- inspect subscription details
- perform operational lifecycle actions
- schedule future plan changes
- edit the subscription shipping address

The UI is implemented as Medusa Admin custom routes and follows Medusa dashboard patterns as closely as possible.

## Route Map

Implemented routes:
- `/app/subscriptions`
- `/app/subscriptions/:id`

Navigation behavior:
- the list route is available as a sidebar page
- clicking a row in the list navigates to the detail route
- the detail route shows breadcrumbs back to the list

## 1. List Page

### Purpose

The list page is the operational overview of all subscriptions.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page title and short description
- list toolbar
- subscriptions DataTable
- pagination

### Columns

The list currently displays:
- `Reference`
- `Customer`
- `Product`
- `Status`
- `Frequency`
- `Next renewal`
- `Updated`
- row action menu

Column rendering uses compact Medusa-style cells:
- primary value on the first line
- supporting value in subtle text on the second line where applicable

### Search

The list has a search input in the top-right area of the toolbar.

Search is intended for broad lookup and currently covers:
- subscription reference
- customer name
- customer email
- product title
- variant title
- SKU

### Filters

The list uses the standard Medusa `Add filter` interaction pattern.

Implemented filters:
- `Status`
- `Trial`
- `Skip next cycle`
- `Next renewal`

Applied filters are shown as chips in the toolbar and can be removed individually.

The list also exposes `Clear all` when any filter is active.

### Sorting

The list uses the standard sorting menu in the toolbar.

It supports sorting on fields exposed by the backend query layer, including:
- `Status`
- `Customer`
- `Product`
- `Next renewal`
- `Updated`

### Row Actions

Each row exposes a trailing action menu.

Implemented list actions:
- `Pause`
- `Resume`
- `Cancel`

Action availability depends on the subscription status:
- `active` -> `Pause`, `Cancel`
- `paused` -> `Resume`, `Cancel`
- `cancelled` -> no further lifecycle mutation actions

### Row Navigation

Clicking a row opens the detail page for that subscription.

The row action menu does not trigger navigation.

## 2. Detail Page

### Purpose

The detail page is the main operational screen for a single subscription.

It combines:
- status visibility
- lifecycle actions
- read-only subscription data
- edit drawers for supported mutation flows

### Header

The detail header contains:
- subscription reference
- short description
- status badge
- action menu

This follows the Medusa pattern of title on the left and status plus actions on the right.

### Main Sections

The detail page currently renders:
- `Subscription`
- `Customer`
- `Product`
- `Shipping address`
- `Pending plan change`

These sections are read-oriented and designed for quick operator inspection.

## 3. Detail Actions

### Action Menu

The detail page action menu includes:
- `Pause`
- `Resume`
- `Schedule plan change`
- `Edit shipping address`
- `Cancel`

Action availability follows the same state rules as the list where relevant.

### Why `Schedule plan change` Lives on Detail Only

`Schedule plan change` is intentionally exposed on the detail page, not in the list row menu.

Reason:
- it is an edit flow with a form
- it requires more context than a lightweight row action
- the Medusa pattern is to keep edit-style flows in details pages and Drawers rather than push them into the list when they are not truly quick actions

## 4. Drawers

The detail page uses Drawers for editing existing subscription data.

This follows the Medusa pattern for edit flows.

### Schedule Plan Change Drawer

Purpose:
- schedule a future plan or cadence update

Fields:
- variant
- frequency interval
- frequency value
- effective at

Behavior:
- variants are loaded only when the drawer is opened
- the form is prefilled from current subscription values or pending plan data
- save is disabled while loading or when required variant data is unavailable

### Edit Shipping Address Drawer

Purpose:
- update the shipping address snapshot assigned to the subscription

Fields:
- first name
- last name
- company
- address line 1
- address line 2
- city
- postal code
- province / state
- country code
- phone

Behavior:
- the drawer is prefilled from the current subscription shipping address
- the form validates required fields before submit
- the save action is shown in standard Medusa Drawer footer form

## 5. Action Rules by Status

Current lifecycle rules in the UI:

- `active`
  - can pause
  - can cancel
  - can schedule a plan change
  - can edit shipping address

- `paused`
  - can resume
  - can cancel
  - can schedule a plan change
  - can edit shipping address

- `past_due`
  - can schedule a plan change
  - can edit shipping address
  - cancellation remains available on detail where supported by backend rules

- `cancelled`
  - no further lifecycle transitions
  - read-only detail view remains available

## 6. Loading, Empty, and Error States

The UI follows Medusa-style state handling.

### List Page

List behavior:
- DataTable loading is driven by the display query
- filtered empty states are rendered by the table
- route-level load failures are rendered as inline `Alert`

### Detail Page

Detail behavior:
- page-level loading uses `Spinner` and subtle loading text
- page-level errors are rendered inline through `Alert`
- a defensive warning state exists if detail data is unavailable

### Drawers

Drawer behavior:
- plan change drawer shows a spinner while loading variants
- drawer-specific errors are shown inline as `Alert`
- when no variants are available, the user sees a clear empty state and cannot save

## 7. Mutation Feedback

The UI provides immediate feedback after mutations.

Implemented behavior:
- confirm prompts for destructive lifecycle actions
- disabled actions while a mutation is pending
- success toasts after successful mutation
- error toasts when a mutation fails
- query invalidation for both list and detail views after mutation success

## 8. UX Decisions

### List vs Detail Responsibilities

The list is designed for:
- discovery
- search
- filtering
- sorting
- quick lifecycle actions

The detail page is designed for:
- inspection
- form-based edits
- context-heavy actions

### Why Customer and Product Are Not Separate `Add filter` Selectors Yet

The list currently relies on search for customer and product lookup instead of dedicated selector filters.

Reason:
- the current backend contract expects `customer_id` and `product_id`
- adding text-based pseudo-filters would create weak UX
- a proper Medusa-style implementation would require dedicated entity selectors

## 9. Tested User Flows

The implemented UI is supported by integration coverage for the underlying Admin flow:
- list subscriptions
- open detail
- pause
- resume
- schedule plan change
- edit shipping address
- cancel

The browser UI itself is not currently covered by Playwright.

The current project relies on Medusa-supported HTTP integration tests for end-to-end backend flow validation.
