# Admin UI: Activity Log

This document describes the implemented Admin UI for the `Activity Log` area in the `Reorder` plugin.

It focuses on:
- screen behavior
- user flows
- data loading
- UI state handling
- UX boundaries

## Purpose

The `Activity Log` Admin UI gives operators a read-oriented audit surface for subscription lifecycle events across:
- `Subscriptions`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

It is meant to help operators:
- review what changed
- understand who or what caused the change
- move from a global audit view to one subscription timeline

The UI is implemented as Medusa Admin custom routes and follows the same dashboard patterns already used by other plugin areas.

## Route Map

Implemented routes and surfaces:
- `/app/subscriptions/activity-log`
- `Activity Log` section inside `/app/subscriptions/:id`

Navigation behavior:
- the global page is nested under `Subscriptions`
- clicking a row in the global page opens event detail in a drawer
- the subscription detail page exposes a dedicated `Activity Log` section for per-subscription review

## 1. Global Activity Log Page

### Purpose

The global page is the cross-subscription audit queue for operators.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page title and short description
- list toolbar
- activity log DataTable
- pagination
- event detail drawer

### Columns

The table currently displays:
- `Subscription`
- `Created`
- `Actor`
- `Event`
- `Reason`

Column rendering follows the same compact Medusa-style pattern used in the other Admin list pages:
- primary value on the first line
- supporting value in subtle text on the second line where helpful

### Search

The page has a search input in the top-right area of the toolbar.

Search is intended for broad lookup and currently covers:
- subscription reference
- customer name
- reason

### Filters

The page uses the same `Add filter` interaction pattern as the existing Admin list pages.

Implemented filters:
- `Event`
- `Actor`

The page also exposes dedicated date inputs for:
- `Created from`
- `Created to`

These date inputs:
- are applied as list filters
- are shown inline in the toolbar area
- are intentionally not rendered as segmented chips

Applied non-date filters are rendered as segmented filter chips, consistent with `Cancellation & Retention`.

The `Actor` presentation prefers the resolved display value from the read model:
- for admin users, this is typically the admin email
- if no display enrichment is available, the UI falls back to `actor_id`

The `Event` cell renders only the event badge in the table view.

The domain label is not shown as a secondary line in the table cell.

The toolbar also exposes:
- `Add filter`
- `Clear all`
- sorting menu

### Quick Presets

The page supports quick event presets for:
- `Subscriptions`
- `Renewals`
- `Dunning`
- `Cancellation`

These presets are implemented as grouped `event_type` selections and rendered like the other active filters.

### Sorting

The page uses the standard sorting menu in the toolbar.

The default list sort is:
- `Created desc`

### Detail Drill-Down

Clicking a row opens a drawer for the selected event.

The drawer shows:
- event overview
- subscription snapshot
- `changed_fields`
- `previous_state`
- `new_state`
- `metadata`

Shipping-address events prefer readable address values in `changed_fields` instead of only technical boolean flags.

The drawer uses a dedicated detail query and does not reload the entire list by itself.

## 2. Subscription Detail Timeline

### Purpose

The subscription detail page includes an `Activity Log` section to show the audit history for one subscription in place.

This gives operators local audit context without leaving the subscription detail view.

### Main UI Elements

The section includes:
- table-based timeline
- filter toolbar
- sorting menu
- pagination
- loading state
- empty state
- inline error alert
- event detail drawer

### Timeline Content

The subscription detail timeline now uses a compact table layout rather than a card list.

The table currently shows:
- `Created`
- `Event`
- `Actor`
- `Summary`

Entries are ordered by:
- `created_at desc`

### Actor Presentation

The timeline distinguishes:
- `admin`
- `system`
- `scheduler`

It uses the same status-badge language and color semantics as the global `Activity Log` page.

The actor cell prefers the resolved display value:
- admin email when available
- `actor_id` only as a fallback

The event cell shows only the event badge.

The summary cell is operator-facing:
- it prefers a readable summary over raw internal field names
- technical keys such as `pending_update_data` are translated before rendering
- the secondary line is shown only when an explicit `reason` exists
- shipping-address diffs are shown in a readable `old -> new` form

### Timeline Filters

The subscription timeline intentionally does not expose a search input.

It supports:
- domain filter
- actor filter
- `Created from`
- `Created to`

The date filters are not always visible.

Instead:
- they are added through `Add filter`
- once added, the corresponding datetime input is rendered below the toolbar
- if removed, the input disappears again

### Detail Drill-Down

Clicking a timeline entry opens an event drawer with:
- `previous_state`
- `new_state`
- `changed_fields`
- `metadata`

This uses a dedicated detail query and keeps the base timeline compact.

## 3. Data Loading

The `Activity Log` Admin UI follows the Medusa display-query pattern.

Implemented behavior:
- the global list loads on mount
- the subscription timeline loads on mount with the subscription detail page
- event detail uses a separate query on demand
- successful Admin mutations invalidate the global list and the relevant subscription timeline

Implementation detail:
- global list data-loading lives in `src/admin/routes/subscriptions/activity-log/data-loading.ts`
- subscription timeline data-loading lives in `src/admin/routes/subscriptions/data-loading.ts`

## 4. UX Boundaries

The implemented UI is intentionally read-oriented.

It does not currently provide:
- edit actions from the log itself
- event export
- saved filters
- personalized views
- grouped or collapsed domain sections

The current UX priorities are:
- consistency with existing Admin pages
- fast drill-down into one event
- stable snapshot-first rendering

## 5. Snapshot-First Decision

The UI renders primarily from the stored `subscription_log` snapshots.

This means:
- the global list does not depend on live linked queries from other modules
- the subscription timeline does not depend on live linked queries from other modules
- the event drawer reflects the stored business audit payload

This is intentional.

It makes the audit trail:
- historically stable
- predictable to operate
- cheaper to read than a heavily enriched cross-module UI
