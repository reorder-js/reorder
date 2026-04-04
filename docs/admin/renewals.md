# Admin UI: Renewals

This document describes the implemented Admin UI for the `Renewals` area in the `Reorder` plugin.

It focuses on screen behavior, user flows, actions, and UI state handling.

## Purpose

The `Renewals` Admin UI gives operators a dedicated workspace to:
- browse scheduled and failed renewal cycles
- inspect execution history and linked records
- review pending changes and approval state
- manually force a renewal
- approve or reject pending changes before renewal

The UI is implemented as Medusa Admin custom routes and follows Medusa dashboard patterns as closely as possible.

## Route Map

Implemented routes:
- `/app/subscriptions/renewals`
- `/app/subscriptions/renewals/:id`

Navigation behavior:
- the renewals page is nested under `Subscriptions`
- clicking a row in the renewals queue navigates to the cycle detail
- the detail route shows breadcrumbs back to the renewals queue

## 1. Queue Page

### Purpose

The queue page is the operational overview of renewal cycles.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page title and short description
- list toolbar
- renewal queue DataTable
- pagination
- dedicated scheduled date inputs

### Columns

The queue currently displays:
- `Scheduled`
- `Subscription`
- `Status`
- `Approval`
- `Last attempt`

Column rendering uses compact Medusa-style cells:
- primary value on the first line
- supporting value in subtle text on the second line where applicable

### Search

The queue has a search input in the top-right area of the toolbar.

Search is intended for broad lookup and currently covers renewal-linked display fields such as:
- subscription reference
- customer name
- product title
- variant title
- SKU

### Filters

The queue uses the standard Medusa `Add filter` interaction pattern.

Implemented filters:
- `Status`
- `Approval`
- `Last attempt`

The page also exposes dedicated date inputs for:
- `Scheduled from`
- `Scheduled to`

These date inputs:
- are applied as list filters
- are initialized on page load to `now - 30 days 00:00` and `now + 30 days 00:00`
- are intentionally not rendered as toolbar filter chips

Applied non-date filters are shown as chips in the toolbar and can be removed individually.

The list also exposes `Clear all` when any filter is active.

### Sorting

The queue uses the standard sorting menu in the toolbar.

It supports sorting on fields exposed by the backend query layer, including:
- `Scheduled`
- `Subscription`
- `Status`
- `Approval`
- `Last attempt`

### Row Navigation

Clicking a row opens the detail page for that renewal cycle.

There is no separate row action menu on the queue page.

## 2. Detail Page

### Purpose

The detail page is the main operational screen for a single renewal cycle.

It combines:
- execution state visibility
- approval state visibility
- read-only linked data
- attempt history
- operational actions

### Header

The detail header contains:
- renewal cycle ID
- short description
- status badge
- action menu

This follows the Medusa pattern of title on the left and status plus actions on the right.

### Main Sections

The detail page currently renders:
- `Cycle overview`
- `Approval summary`
- `Subscription summary`
- `Generated order summary`
- `Pending changes`
- `Attempt history`
- `Technical metadata`

These sections are read-oriented and designed for quick operator inspection.

Layout:
- the left column contains `Cycle overview`, `Approval summary`, `Pending changes`, `Attempt history`, and `Technical metadata`
- the right column contains `Subscription summary` and `Generated order summary` as linked Medusa-style cards

## 3. Detail Actions

### Action Menu

The detail page action menu includes:
- `Force renewal`
- `Approve changes`
- `Reject changes`

### Action Availability

Current action rules in the UI:

- `Force renewal`
  Available when cycle status is `scheduled` or `failed`.
- `Approve changes`
  Available only when approval is required and approval status is `pending`.
- `Reject changes`
  Available only when approval is required and approval status is `pending`.

Actions are disabled while a mutation is pending.

## 4. Drawers and Confirmation Flows

The detail page uses Drawers for approval decisions and confirm prompts for risky actions.

This follows the Medusa pattern of keeping edit or decision flows in Drawers rather than inline.

### Approve Changes Drawer

Purpose:
- record the approval decision for pending changes

Fields:
- optional `reason`

Behavior:
- the drawer opens from the action menu
- submit shows a final confirmation prompt
- errors are displayed inline in the drawer and through toast feedback
- the drawer uses existing detail data and local form state rather than a separate remote display query

### Reject Changes Drawer

Purpose:
- record the rejection decision for pending changes

Fields:
- required `reason`

Behavior:
- the drawer opens from the action menu
- `reason` is required before submit
- submit shows a final confirmation prompt
- errors are displayed inline in the drawer and through toast feedback
- the drawer uses existing detail data and local form state rather than a separate remote display query

### Force Renewal Confirmation

Purpose:
- guard the manual execution of a renewal cycle

Behavior:
- the action opens a confirm prompt before mutation
- the action is disabled while the mutation is pending

## 5. Data Loading

The `Renewals` Admin UI follows the Medusa display-query pattern.

Implemented behavior:
- the queue display query loads on mount
- the detail display query loads on mount
- drawer state does not control the main display query
- successful mutations invalidate both list and detail queries

The approval drawers do not have separate remote display queries because they operate on:
- local form state
- data already present in the detail payload

Implementation detail:
- data-loading lives in `src/admin/routes/subscriptions/renewals/data-loading.ts`
- successful actions use shared invalidation to refresh both queue and detail state

## 6. Loading, Error, and Empty States

### Queue Page

The queue page provides:
- DataTable loading state
- DataTable empty state
- page-level error alert when the queue query fails

### Detail Page

The detail page provides:
- explicit loading state
- explicit error state
- fallback warning state if detail data is unavailable

### Section Empty States

The detail page also provides explicit empty states for:
- no pending changes
- no attempts
- no metadata
- no generated order

This avoids raw empty gaps in operational screens.

## 7. UX Notes

The current UI intentionally keeps `Renewals` as an operational page under `Subscriptions`, similar to `Plans & Offers`.

This keeps the plugin navigation structured around:
- subscriptions as the operational parent area
- renewals as a queue and review sub-area

The implemented visual patterns match the rest of the plugin:
- Medusa `DataTable`
- `StatusBadge`
- detail `Container` sections
- Drawers for decisions
- prompts for risky actions

Implemented route files:
- `src/admin/routes/subscriptions/renewals/page.tsx`
- `src/admin/routes/subscriptions/renewals/[id]/page.tsx`

## Related Documents

- [Renewals Architecture](../architecture/renewals.md)
- [Admin Renewals API](../api/admin-renewals.md)
- [Renewals Testing](../testing/renewals.md)
- [Renewals Specs](../specs/renewals/admin-spec.md)
