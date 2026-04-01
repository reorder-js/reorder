# Admin UI: Cancellation & Retention

This document describes the implemented Admin UI for the `Cancellation & Retention` area in the `Reorder` plugin.

It focuses on screen behavior, user flows, actions, and UI state handling.

## Purpose

The `Cancellation & Retention` Admin UI gives operators a dedicated workspace to:
- browse active and historical cancellation cases
- inspect linked subscription, dunning, and renewal context
- review churn reasons and retention outcomes
- run smart cancellation recommendation
- apply retention offers
- finalize cancellation
- update churn reason classification

The UI is implemented as Medusa Admin custom routes and follows the same nested `Subscriptions` pattern already used by `Renewals` and `Dunning`.

## Route Map

Implemented routes:
- `/app/subscriptions/cancellations`
- `/app/subscriptions/cancellations/:id`

Navigation behavior:
- the cancellations page is nested under `Subscriptions`
- clicking a row in the cancellation queue navigates to case detail
- the detail route shows breadcrumbs back to the cancellation queue

## 1. Queue Page

### Purpose

The queue page is the operational overview of cancellation cases.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page title and short description
- list toolbar
- cancellation queue DataTable
- pagination
- dedicated created-date inputs

### Columns

The queue currently displays:
- `Subscription`
- `Reason`
- `Reason category`
- `Outcome`
- `Retention decision`
- `Created`

Column rendering uses compact Medusa-style cells:
- primary value on the first line
- supporting value in subtle text on the second line where applicable

### Search

The queue has a search input in the toolbar.

Search is intended for broad lookup and currently covers cancellation-linked display fields such as:
- subscription reference
- customer name
- product title
- variant title
- churn reason text

### Filters

The queue uses the standard Medusa `Add filter` interaction pattern.

Implemented filters:
- `Reason category`
- `Outcome`
- `Offer type`

The page also exposes dedicated date inputs for:
- `Created from`
- `Created to`

These date inputs:
- are applied as list filters
- are initialized on page load to `now - 30 days` and `now + 30 days`
- are intentionally not rendered as toolbar filter chips

Applied non-date filters are shown as chips in the toolbar and can be removed individually.

The list also exposes `Clear all` when any non-default filter is active.

### Sorting

The queue uses the standard sorting menu in the toolbar.

It supports sorting on fields exposed by the backend query layer, including:
- `Created`
- `Status`
- `Outcome`
- `Reason category`
- selected display-enriched fields such as subscription summary

### Row Navigation

Clicking a row opens the detail page for that cancellation case.

There is no separate row action menu on the queue page.

## 2. Detail Page

### Purpose

The detail page is the main operational screen for one cancellation case.

It combines:
- churn and retention state visibility
- linked operational context
- recommendation and outcome visibility
- offer history
- manual actions

### Header

The detail header contains:
- cancellation case ID
- short description
- status badge
- action menu

This follows the Medusa pattern of title on the left and status plus actions on the right.

### Main Sections

The detail page currently renders:
- `Case overview`
- `Subscription summary`
- `Dunning summary`
- `Renewal summary`
- `Smart cancellation`
- `Decision timeline`
- `Offer history`
- `Technical metadata`

These sections are read-oriented and designed for quick operator inspection.

## 3. Detail Actions

### Action Menu

The detail page action menu includes:
- `Run smart cancellation`
- `Apply retention offer`
- `Update reason`
- `Finalize cancellation`

### Action Availability

Current action rules in the UI:

- `Run smart cancellation`
  Available for active, non-terminal cases.
- `Apply retention offer`
  Available for active, non-terminal cases.
- `Update reason`
  Available for active, non-terminal cases.
- `Finalize cancellation`
  Available for active, non-terminal cases.

Terminal statuses are treated as read-only:
- `retained`
- `paused`
- `canceled`

Actions are disabled while the corresponding mutation is pending.

## 4. Drawers and Confirmation Flows

The detail page uses Drawers for mutation forms and confirmation prompts for risky actions.

This follows the Medusa pattern of keeping edit flows in Drawers rather than inline.

### Smart Cancellation Confirmation

Purpose:
- guard recalculation of the recommendation state

Behavior:
- the action opens a confirm prompt before mutation
- the action is disabled while the mutation is pending

### Apply Offer Drawer

Purpose:
- capture the concrete retention action payload

Fields vary by `offer_type`.

#### Pause Offer Fields
- `pause_cycles`
- `resume_at`
- `decision_reason`
- `note`

#### Discount Offer Fields
- `discount_type`
- `discount_value`
- `duration_cycles`
- `decision_reason`
- `note`

#### Bonus Offer Fields
- `bonus_type`
- `value`
- `label`
- `duration_cycles`
- `decision_reason`
- `note`

Behavior:
- the drawer uses a dedicated action-form query
- the form is prefilled from current case state where relevant
- submit shows a confirm prompt before mutation
- `pause_offer` uses a stronger warning confirm because it changes subscription lifecycle state

### Update Reason Drawer

Purpose:
- update churn reason and classification

Fields:
- `reason`
- `reason_category`
- `notes`
- `update_reason`

Behavior:
- the drawer uses a dedicated action-form query
- the form is prefilled from current case fields
- submit saves directly through the workflow-backed route

### Finalize Cancellation Drawer

Purpose:
- close the case as `canceled`

Fields:
- `reason`
- `reason_category`
- `notes`
- `effective_at`

Behavior:
- the drawer uses a dedicated action-form query
- submit shows a final confirm prompt
- the confirm explains the lifecycle impact of canceling the subscription

## 5. Data Loading

The `Cancellation & Retention` Admin UI follows the Medusa display-query pattern.

Implemented behavior:
- the queue display query loads on mount
- the detail display query loads on mount
- action drawers use their own dedicated query
- successful mutations invalidate both list and detail queries
- the action-form query is also invalidated after mutations
- prepared analytics query keys are invalidated even though analytics UI is deferred
- display queries do not depend on modal or drawer UI state

Implementation detail:
- data-loading lives in `src/admin/routes/subscriptions/cancellations/data-loading.ts`
- shared invalidation refreshes queue, detail, action-form, and prepared analytics query state

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

### Drawer Loading and Error States

The action drawers provide:
- local loading state while the action-form query is loading
- inline form error state for failed mutations
- disabled submit actions while mutations are pending

### Section Empty States

The detail page also provides explicit empty states for:
- no linked dunning summary
- no linked renewal summary
- no decision timeline entries
- no offer history
- no metadata

This avoids raw empty gaps in operational screens.

## 7. UX Notes

The current UI intentionally keeps risky actions on the detail page rather than the queue.

Why:
- retention and cancellation actions need more context than a lightweight row action
- the detail page shows recommendation, offer history, and linked operational context before mutation
- this matches the Medusa pattern already used by `Renewals` and `Dunning`

Another intentional choice:
- date inputs on the queue are not rendered as filter chips
- they behave like the dedicated date inputs on the `Renewals` queue

This keeps the toolbar compact and avoids confusing duplication between date inputs and filter chips.
