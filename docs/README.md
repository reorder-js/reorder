# Reorder Docs

`Reorder` is a Medusa.js plugin for recurring commerce flows managed from the Admin.

At the moment, the following areas are implemented and tested:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`

The remaining areas from the implementation plan are still in progress:
- `Dunning`

## Current Status

Completed:
- `Subscriptions` domain model
- `Subscriptions` admin API routes
- `Subscriptions` Admin UI: list, details, actions, plan change, shipping address edit
- `Subscriptions` backend integration tests
- `Subscriptions` admin flow integration test
- `Plans & Offers` domain model
- `Plans & Offers` admin API routes
- `Plans & Offers` Admin UI: list, create, edit, toggle, filtering, sorting, and selection flows
- `Plans & Offers` backend integration tests
- `Plans & Offers` admin flow integration coverage
- smoke-level integration between `Plans & Offers` and `Subscriptions`
- `Renewals` domain model
- `Renewals` admin API routes
- `Renewals` Admin UI: queue, detail, approval, reject, and force flows
- `Renewals` backend integration tests
- `Renewals` admin flow integration coverage
- smoke-level integration between `Renewals`, `Subscriptions`, and `Plans & Offers`
- `Renewals` operational hardening for scheduler and manual execution flows

In progress:
- next implementation stages from the roadmap

## Documentation Map

Use these documents depending on what you need:

- `specs/`
  Early design and planning documents created before or during implementation.
- `architecture/`
  Technical documentation describing how each domain area is structured.
- `api/`
  Current API contracts used by the Admin and other consumers.
- `admin/`
  Admin UI behavior, screens, actions, filters, and UX conventions.
- `testing/`
  How tests are structured, what is covered, and how to run them.

Runtime source-of-truth documents currently exist for:

- `Subscriptions`
  - `architecture/subscriptions.md`
  - `api/admin-subscriptions.md`
  - `admin/subscriptions.md`
  - `testing/subscriptions.md`
- `Plans & Offers`
  - `architecture/plan-offers.md`
  - `api/admin-plan-offers.md`
  - `admin/plan-offers.md`
  - `testing/plan-offers.md`
- `Renewals`
  - `architecture/renewals.md`
  - `api/admin-renewals.md`
  - `admin/renewals.md`
  - `testing/renewals.md`

## Recommended Reading Order

For a new developer joining the project:
1. Read this file.
2. Read the architecture document for the area you work on.
3. Read the API document for that area.
4. Read the Admin UI document if you touch dashboard flows.
5. Read the testing document before changing behavior.

## Implemented Areas

The currently implemented areas are `Subscriptions`, `Plans & Offers`, and `Renewals`.

### Subscriptions

This area includes:
- subscription list in Admin
- subscription details page
- pause, resume, and cancel actions
- schedule plan change
- edit shipping address
- filters, sorting, pagination, and loading/error states

### Plans & Offers

This area includes:
- product-level and variant-level subscription offer configuration
- allowed frequencies and per-frequency discounts
- offer rules such as minimum cycles, trial settings, and stacking policy
- Admin management page with create, edit, filter, sort, and toggle flows
- effective config resolution with `variant > product` semantics
- integration with `Subscriptions` plan-change validation

### Renewals

This area includes:
- renewal cycle queue in Admin
- renewal cycle detail page
- approve and reject flows for pending changes
- force renewal flow
- scheduler-backed and manual renewal execution
- attempt history and linked subscription/order summaries
- integration with `Subscriptions` eligibility and pending changes
- integration with `Plans & Offers` policy validation at execution time
- operational hardening through workflow locking, correlation IDs, structured logs, and scheduler summary metrics

## Notes

- The documents under `specs/` are design-time documents. They are useful for context, but they should not be treated as the final source of truth once implementation evolves.
- The documents in `architecture/`, `api/`, `admin/`, and `testing/` are the runtime source of truth for implemented behavior.
- The implementation plan remains the roadmap for future work, while the runtime documentation should describe the current state of the plugin.
