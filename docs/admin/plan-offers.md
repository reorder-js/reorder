# Admin UI: Plans & Offers

This document describes the implemented Admin UI for the `Plans & Offers` area in the `Reorder` plugin.

It focuses on screen behavior, user flows, actions, data loading, and UI state handling.

## Purpose

The `Plans & Offers` Admin UI gives operators a dedicated workspace to:
- browse existing subscription offer configurations
- inspect effective configuration behavior
- create product-level and variant-level offers
- edit existing offer configuration
- enable or disable offers

The UI is implemented as a Medusa Admin custom route and follows Medusa dashboard patterns as closely as possible.

## Route Map

Implemented route:
- `/subscriptions/plans-offers`

Navigation behavior:
- the route is registered as a nested page under `Subscriptions`
- the page includes a secondary action linking back to `Subscriptions`
- there is no separate detail route for an offer
- editing happens in-place through a Drawer instead of navigation to another page

## 1. List Page

### Purpose

The page is the operational and configuration view for subscription offers.

It is implemented with Medusa `DataTable`.

### Main UI Elements

The page includes:
- page heading and short description
- toolbar actions
- plans and offers DataTable
- pagination
- product and variant selection modals
- create modal
- edit drawer

### Header Actions

The page header includes:
- `View Subscriptions`
- `Create`

`View Subscriptions` is a secondary navigation action.

`Create` opens the create flow in a `FocusModal`.

## 2. List Page

### Table Purpose

The table is the main overview of all configured offers.

It is intended for:
- comparing product-level and variant-level offers
- finding disabled or mismatched configurations
- opening edit flows quickly
- inspecting which source record is currently effective

### Columns

The table currently displays:
- `Name`
- `Target`
- `Status`
- `Frequencies`
- `Effective source`
- `Updated`
- row action menu

Column rendering follows compact Medusa-style patterns:
- primary value on the first line
- supporting context in subtle text on the second line where useful

### Effective Source Column

The `Effective source` column is a read-oriented summary.

It shows whether the current winning configuration is:
- `Product`
- `Variant`
- `Inactive`

This is useful when a source record is disabled but still has a product-level fallback, or when no active offer exists for the target context.

## 3. Search, Filters, and Sorting

### Search

The page includes a top-right DataTable search input.

Search is intended for broad lookup and currently covers:
- offer name
- product title
- variant title
- SKU

### Filters

The list uses the standard Medusa `Add filter` interaction pattern.

Implemented filters:
- `Status`
- `Scope`
- `Frequency`
- `Discount range`
- `Product`
- `Variant`

Applied filters are shown as removable filter chips in the toolbar.

The page also exposes `Clear all` when any filter is active.

### Product and Variant Filters

Product and variant filters do not use weak free-text matching.

Instead:
- `Product` opens a picker modal with search and pagination
- `Variant` opens a variant picker scoped to the selected product

This follows the Medusa pattern of using structured selection for larger datasets.

### Sorting

The list uses the standard DataTable sorting menu.

It supports sorting on fields exposed by the backend query layer, including:
- `Name`
- `Status`
- `Product`
- `Updated`

## 4. Row Actions

Each row exposes a trailing action menu.

Implemented row actions:
- `Edit`
- `Enable`
- `Disable`

### Edit

`Edit` opens the existing offer in a Drawer.

### Toggle

`Enable` and `Disable` are destructive-style operational actions guarded by a confirmation prompt.

Before the mutation runs, the user must confirm the action.

While the mutation is pending:
- the affected row action label changes to `Enabling...` or `Disabling...`
- repeat actions on the same row are blocked

## 5. Create Flow

The create flow uses a `FocusModal`.

This follows the Medusa pattern for creating new entities.

### Purpose

The create flow is used to define a new source offer for either:
- a product
- a specific variant

### Main Sections

The modal currently supports:
- `Name`
- `Scope`
- `Product`
- optional `Variant`
- `Offer enabled`
- `Frequencies`
- `Rules`

### Frequencies and Discounts

The create form supports multiple frequency rows.

Each row can define:
- frequency interval
- frequency value
- optional discount
- discount type
- discount value

The user can:
- add rows
- remove rows with confirmation

### Rules Section

The rules area supports:
- minimum cycles
- trial enabled / disabled
- trial days
- stacking policy

Client-side validation enforces rule consistency before submission.

### Modal Behavior

The create modal:
- resets form state when closed
- keeps product and variant selection separate from the main display query
- disables submit while the mutation is pending
- shows success and error feedback through toast messages

## 6. Edit Flow

The edit flow uses a `Drawer`.

This follows the Medusa pattern for editing existing entities.

### Purpose

The Drawer is used to update an existing source record without leaving the list page.

### What Can Be Edited

The edit flow supports:
- name
- enabled state
- frequencies
- discounts
- rules

The target itself is read-only in the Drawer.

This means:
- product and variant context are displayed
- product/variant retargeting is not part of the edit flow

### Drawer Behavior

The Drawer:
- fetches detail data only when opened
- pre-fills the form from the current source record
- shows inline loading state while the detail query resolves
- shows inline error state through `Alert` if detail loading fails
- invalidates both display and detail queries after a successful save

## 7. Product and Variant Selection UX

The page uses dedicated picker flows instead of free-form text inputs.

### Product Picker

The product picker:
- uses a `FocusModal`
- displays a selectable DataTable
- supports search
- supports pagination
- applies a single selected product back into the active flow

### Variant Picker

The variant picker:
- uses a `FocusModal`
- loads variants for the selected product only
- shows a compact DataTable
- allows selection of one variant at a time

### Why Structured Selection Is Used

This pattern is preferred because:
- products and variants are not small static option sets
- IDs and titles should come from real Admin data
- the UX stays aligned with Medusa’s approach for selecting entities from larger datasets

## 8. Loading, Empty, and Error States

The UI follows Medusa-style state handling.

### List Page

List behavior:
- DataTable loading is driven by the display query
- route-level load failures are rendered through an inline `Alert`
- the table provides two empty states:
- `No plan offers yet`
- `No matching plan offers`

This keeps empty and filtered-empty messaging distinct while preserving the page shell.

### Drawers and Modals

Modal and drawer behavior:
- the create modal keeps its own pending and validation state
- the edit Drawer provides a local loading state
- the edit Drawer provides a local error state

These states do not block the main list page.

## 9. Data Loading and Query Invalidation

The page follows the Medusa dashboard data-loading pattern.

### Display Query

The list display query:
- loads on mount
- is not conditionally tied to modal or drawer state
- uses `sdk.client.fetch()` against the custom Admin route
- uses `keepPreviousData` for smoother pagination and filtering changes

### Interaction Queries

Modal and drawer data is separated by responsibility:
- product selection query loads only when the product picker is open
- variant selection query loads only when the variant picker is open
- detail query loads only when the edit Drawer is open

This separation avoids coupling main page rendering to modal-only data.

### Invalidation Strategy

After successful create, update, or toggle:
- the plans and offers list query is invalidated
- the relevant detail query is invalidated when applicable

This ensures:
- the table refreshes after mutations
- the edit Drawer stays consistent after save

## 10. UI and UX Conventions

The page follows established Medusa dashboard conventions.

### Components

The implementation uses Medusa UI building blocks such as:
- `Container`
- `DataTable`
- `FocusModal`
- `Drawer`
- `Alert`
- `StatusBadge`
- `Text`
- `Button`

### Interaction Model

The UI intentionally separates:
- create flows for new entities
- edit flows for existing entities
- display queries from modal-only queries
- quick actions from form-based editing

### Button and Status Patterns

The page follows Medusa-style action treatment:
- small action buttons
- semantic success and error toasts
- confirmation prompts for risky actions
- status shown through `StatusBadge`

### Layout Style

The page follows the same practical Medusa admin layout approach used elsewhere in the plugin:
- header and description at the top
- toolbar with filters, search, and sorting
- DataTable as the main operational surface

## Related Documents

- [Docs Overview](../README.md)
- [Plans & Offers Architecture](../architecture/plan-offers.md)
- [Plans & Offers Admin API](../api/admin-plan-offers.md)
- [Plans & Offers Testing](../testing/plan-offers.md)
- [Roadmap](../roadmap/implementation-plan.md)
