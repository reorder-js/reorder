# Plans & Offers Admin UX Spec

## 1. Purpose

This document defines the Admin UX for the `Plans & Offers` area.

The goal is to follow Medusa Admin conventions as closely as possible and stay visually and behaviorally aligned with the already implemented `Subscriptions` UI in this plugin.

This is a UX and interaction spec only. It does not implement the Admin page yet.

## 2. Source of truth for UX direction

The primary UX reference for this feature is the existing `Subscriptions` Admin implementation in this plugin.

Why:
- it already follows Medusa Admin conventions well
- it matches the codebase's existing information architecture
- it sets the quality bar for spacing, table patterns, error handling, loading states, and mutations

Implementation references:
- `reorder/src/admin/routes/subscriptions/page.tsx`
- `reorder/src/admin/routes/subscriptions/[id]/page.tsx`
- `reorder/src/admin/routes/subscriptions/data-loading.ts`

## 3. Information architecture

`Plans & Offers` should not be introduced as a top-level Admin area.

It should be a nested Admin route under `Subscriptions`, similar to how Medusa shows child pages under existing parent areas such as:
- `Products`
- `Collections`
- `Categories`

### Target route structure

Recommended route:
- `/subscriptions/plans-offers`

Recommended Admin route config:
- label: `Plans & Offers`
- nested: `/subscriptions`

Why:
- this keeps the feature conceptually grouped with subscription management
- it avoids scattering subscription-related configuration across separate top-level areas
- it matches the user's expected IA

## 4. Navigation behavior

When the user opens the `Subscriptions` area in the Admin sidebar:
- `Subscriptions` remains the parent entry
- `Plans & Offers` appears as a nested child route beneath it

Expected behavior:
- the user can move between the subscription list and the plan-offer configuration area without leaving the broader subscription domain
- the child route should inherit standard Medusa page chrome and spacing
- no custom navigation system should be introduced if nested sidebar navigation already covers the need

## 5. Page responsibilities

### 5.1 Subscriptions page

The existing `Subscriptions` page remains responsible for:
- listing subscriptions
- opening subscription detail
- performing subscription lifecycle actions

### 5.2 Plans & Offers page

The new `Plans & Offers` page is responsible for:
- listing source records `PlanOffer`
- exposing create and edit actions
- exposing enable/disable actions
- showing effective configuration summaries

It should not attempt to behave like a subscription detail page.

## 6. Create vs edit separation

Create and edit must be intentionally separated.

### Create flow

Purpose:
- create a new source configuration for either:
  - a product
  - a variant

The create flow owns:
- target selection
- initial plan-offer configuration
- initial validation UX

### Edit flow

Purpose:
- update an existing `PlanOffer` source record

The edit flow owns:
- editing mutable configuration fields
- preserving the target identity of the record

The edit flow must not allow changing:
- `scope`
- `product_id`
- `variant_id`

Changing target is semantically equivalent to creating a different record.

## 7. Modal container decisions

### 7.1 Create uses `FocusModal`

The create flow should use `FocusModal`.

Why:
- Medusa Admin patterns recommend `FocusModal` for create forms
- create is a primary task with more setup context than a quick inline edit
- the user needs focused space for:
  - target selection
  - product/variant lookup
  - frequencies and discount setup
  - rules definition

### 7.2 Edit uses `Drawer`

The edit flow should use `Drawer`.

Why:
- Medusa Admin patterns recommend `Drawer` for edit/update forms
- edit is contextual to a row that already exists in the list
- the user benefits from keeping the list context visible while changing configuration

## 8. Plans & Offers list page UX

The list page should use the same overall page structure as `Subscriptions`:
- `Container`
- page header with title and primary CTA
- `DataTable`
- empty, loading, and error states consistent with Medusa UI conventions

### Header

Header content:
- title: `Plans & Offers`
- subtitle or supporting text is optional, only if it adds real clarity
- primary action button: `Create`

### Table purpose

The table represents source records, not derived configs.

Each row should communicate:
- which target the offer belongs to
- whether the source record is enabled
- what frequencies and discounts it defines
- which source wins in the effective config

## 9. Data loading separation

The page must follow the same pattern as `Subscriptions` and the Medusa Admin skill guidance:

- display query loads on mount
- create helper query is separate
- edit helper/detail query is separate

### 9.1 Display query

Display query responsibilities:
- list of plan offers
- filters
- sorting
- pagination
- effective config summary used in the list

This query must load immediately on page mount.

### 9.2 Create helper query

Create helper query responsibilities:
- product lookup data
- variant lookup data if needed
- any lightweight helper metadata for form selection

This query should load only when the create modal is opened.

### 9.3 Edit helper query

Edit helper query responsibilities:
- fetch the current source record detail
- fetch any helper data needed by the drawer form

This query should load only when the edit drawer is opened.

## 10. Create flow UX

### Entry point

Primary CTA on the `Plans & Offers` page:
- `Create`

### Container

`FocusModal`

### Form structure

Recommended sections:
- target
- billing frequencies
- discounts
- rules
- advanced metadata, if exposed at all

### Target section

Fields:
- `scope`
- `product_id`
- `variant_id`

Behavior:
- if `scope = product`, variant selection is hidden or disabled
- if `scope = variant`, variant selection is required

### Submission behavior

On submit success:
- close the `FocusModal`
- invalidate the plan-offer display query
- optionally invalidate relevant detail queries if cached
- show success toast

On submit error:
- keep modal open
- show inline field errors when possible
- show toast for backend/domain failures

## 11. Edit flow UX

### Entry point

From a row action:
- `Edit`

### Container

`Drawer`

### Form behavior

The drawer opens with prefilled values from the selected source record.

Locked fields:
- `scope`
- `product_id`
- `variant_id`

Editable fields:
- `name`
- `is_enabled`
- `allowed_frequencies`
- `discounts`
- `rules`
- `metadata` if exposed

### Submission behavior

On submit success:
- close drawer
- invalidate display query
- invalidate affected detail query
- show success toast

On submit error:
- keep drawer open
- show error feedback without losing form state

## 12. Row actions

Recommended row actions:
- `Edit`
- `Enable` or `Disable`

Optional:
- `View details` only if the page later gets a dedicated detail route or side panel

At this stage, the minimum required actions are:
- edit existing configuration
- toggle enabled state

## 13. Empty, loading, and error states

### Loading

The list should show standard Medusa loading behavior:
- loading `DataTable`
- not an empty state placeholder during first load

### Empty

The empty state should:
- clearly explain that no plan offers exist yet
- include a primary CTA to create the first plan offer

### Error

The error state should use Medusa UI conventions:
- `Alert`
- concise domain-aware copy

## 14. Query invalidation

After create/edit/toggle:
- invalidate the list display query
- invalidate the detail query for the affected source record when relevant

Do not rely only on modal-local state updates.

The source of truth remains the backend read model.

## 15. Interaction constraints

To stay aligned with the existing `Subscriptions` UX:
- avoid mixing create and edit into the same container
- avoid opening the create form in a drawer
- avoid allowing target reassignment in edit
- avoid coupling page display data to create/edit helper queries

## 16. Resulting implementation guidance

The next implementation step should produce:
- a nested Admin route under `Subscriptions`
- a `DataTable`-based page for `Plans & Offers`
- a `FocusModal` create form
- a `Drawer` edit form
- separate display and helper queries
- query invalidation and toast feedback consistent with `Subscriptions`
