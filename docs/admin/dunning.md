# Admin UI: Dunning

This document describes the implemented Admin UI for the `Dunning` area in the `Reorder` plugin.

It focuses on screen behavior, user flows, actions, and UI state handling.

## Purpose

The `Dunning` Admin UI gives operators a dedicated workspace to:
- browse active and historical dunning cases
- inspect linked subscription, renewal, and order context
- review retry history and payment failures
- manually retry payment recovery
- manually mark cases recovered or unrecovered
- override retry schedules for active cases

The UI is implemented as Medusa Admin custom routes and follows the same nested `Subscriptions` pattern already used by `Plans & Offers` and `Renewals`.

## Route Map

Implemented routes:
- `/app/subscriptions/dunning`
- `/app/subscriptions/dunning/:id`

Navigation behavior:
- the dunning page is nested under `Subscriptions`
- clicking a row in the dunning queue navigates to case detail
- the detail route shows breadcrumbs back to the dunning queue

## 1. Queue Page

### Purpose

The queue page is the operational overview of dunning cases.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page title and short description
- list toolbar
- dunning queue DataTable
- pagination
- dedicated filter inputs

### Columns

The queue currently displays:
- `Subscription`
- `Status`
- `Next retry`
- `Attempts`
- `Last error`
- `Renewal / Order`
- `Updated`

Column rendering uses compact Medusa-style cells:
- primary value on the first line
- supporting value in subtle text on the second line where applicable

### Search

The queue has a search input in the toolbar.

Search is intended for broad lookup and currently covers dunning-linked display fields such as:
- subscription reference
- customer name
- product title
- variant title
- SKU
- payment provider
- last payment error code

### Filters

The queue uses the standard Medusa `Add filter` interaction pattern.

Implemented filters:
- `Status`

The page also exposes dedicated inputs for:
- `Provider id`
- `Error code`
- `Attempts min`
- `Attempts max`
- `Next retry from`
- `Next retry to`

Applied `status` filters are shown as chips in the toolbar.

The dedicated text, numeric, and date filters are applied as list filters but are intentionally not rendered as filter chips.

### Sorting

The queue uses the standard sorting menu in the toolbar.

It supports sorting on fields exposed by the backend query layer, including:
- `Updated`
- `Status`
- `Next retry`
- `Attempts`
- `Last attempt`
- selected display-enriched fields such as subscription or order summary

### Row Navigation

Clicking a row opens the detail page for that dunning case.

There is no separate row action menu on the queue page.

## 2. Detail Page

### Purpose

The detail page is the main operational screen for one dunning case.

It combines:
- recovery state visibility
- linked operational context
- retry history
- manual actions
- retry schedule management

### Header

The detail header contains:
- dunning case ID
- short description
- status badge
- action menu

This follows the Medusa pattern of title on the left and status plus actions on the right.

### Main Sections

The detail page currently renders:
- `Case overview`
- `Subscription summary`
- `Renewal summary`
- `Order / payment summary`
- `Retry schedule`
- `Attempt timeline`
- `Technical metadata`

These sections are read-oriented and designed for quick operator inspection.

## 3. Detail Actions

### Action Menu

The detail page action menu includes:
- `Retry now`
- `Mark recovered`
- `Mark unrecovered`
- `Edit retry schedule`

### Action Availability

Current action rules in the UI:

- `Retry now`
  Available for active retryable cases and blocked for terminal or in-flight states.
- `Mark recovered`
  Available for active non-terminal cases and blocked while retry is in flight.
- `Mark unrecovered`
  Available for active non-terminal cases and blocked while retry is in flight.
- `Edit retry schedule`
  Available for non-terminal cases and blocked while retry is in flight.

Actions are disabled while the corresponding mutation is pending.

## 4. Drawers and Confirmation Flows

The detail page uses confirmation prompts for risky actions and a Drawer for retry-schedule editing.

This follows the Medusa pattern of keeping edit flows in Drawers rather than inline.

### Retry Now Confirmation

Purpose:
- guard immediate payment retry from Admin

Behavior:
- the action opens a confirm prompt before mutation
- the action is disabled while the mutation is pending

### Mark Recovered Confirmation

Purpose:
- guard manual closure of a case as recovered

Behavior:
- the action opens a confirm prompt before mutation
- the action is disabled while the mutation is pending

### Mark Unrecovered Confirmation

Purpose:
- guard manual closure of a case as unrecovered

Behavior:
- the action opens a confirm prompt before mutation
- the action is disabled while the mutation is pending

### Retry Schedule Drawer

Purpose:
- edit the retry intervals and max attempts for one case

Fields:
- optional `reason`
- `intervals`
- `max_attempts`

Behavior:
- the drawer loads its own query data
- submit shows explicit loading state
- the drawer shows validation and warning UI for risky schedule overrides
- a final confirmation is shown before saving the override

## 5. Data Loading

The `Dunning` Admin UI follows the Medusa display-query pattern.

Implemented behavior:
- the queue display query loads on mount
- the detail display query loads on mount
- the retry-schedule Drawer has its own dedicated query
- successful mutations invalidate both list and detail queries
- the retry-schedule Drawer query is also invalidated after schedule changes
- display queries do not depend on modal or drawer UI state

Implementation detail:
- data-loading lives in `src/admin/routes/subscriptions/dunning/data-loading.ts`
- shared invalidation refreshes queue, detail, and schedule-form query state

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
- no linked renewal
- no linked order
- no retry attempts
- no metadata
- no retry schedule

This avoids raw empty gaps in operational screens.

## 7. UX Notes

The implemented Dunning UI intentionally stays close to the existing Admin language used elsewhere in the plugin:
- it is nested under `Subscriptions`
- it uses the same `DataTable` and detail-page composition patterns as `Renewals`
- it relies on workflow-backed mutations and refreshed detail payloads
- it uses confirm prompts and drawers rather than custom interaction patterns

This keeps operator behavior consistent across `Subscriptions`, `Plans & Offers`, `Renewals`, and `Dunning`.
