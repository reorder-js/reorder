# Reorder Docs

`Reorder` is a Medusa.js plugin for recurring commerce flows managed from the Admin.

At the moment, the following areas are implemented and tested:
- `Subscriptions`
- `Plans & Offers`

The remaining areas from the implementation plan are still in progress:
- `Renewals`
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

## Recommended Reading Order

For a new developer joining the project:
1. Read this file.
2. Read the architecture document for the area you work on.
3. Read the API document for that area.
4. Read the Admin UI document if you touch dashboard flows.
5. Read the testing document before changing behavior.

## Implemented Areas

The currently implemented areas are `Subscriptions` and `Plans & Offers`.

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

## Notes

- The documents under `specs/` are design-time documents. They are useful for context, but they should not be treated as the final source of truth once implementation evolves.
- The documents in `architecture/`, `api/`, `admin/`, and `testing/` are the runtime source of truth for implemented behavior.
- The implementation plan remains the roadmap for future work, while the runtime documentation should describe the current state of the plugin.
