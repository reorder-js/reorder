# Reorder Docs

`Reorder` is a Medusa.js plugin for recurring commerce flows managed from the Admin.

It now also exposes customer-facing Store API routes for subscription checkout, subscription account actions, and PDP subscription offer resolution.

At the moment, the following areas are implemented and tested:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`
- `Activity Log`
- `Analytics`

## Current Status

Completed:
- `Subscriptions` domain model
- `Subscriptions` admin API routes
- `Subscriptions` Admin UI: list, details, actions, plan change, shipping address edit, and order-detail subscription widget
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
- `Dunning` domain model
- `Dunning` admin API routes
- `Dunning` Admin UI: queue, detail, retry-now, mark recovered, mark unrecovered, and retry schedule override
- `Dunning` backend integration tests
- `Dunning` admin flow integration coverage
- smoke-level integration between `Dunning`, `Renewals`, and `Subscriptions`
- `Dunning` operational hardening for scheduler and manual retry flows
- `Cancellation & Retention` domain model
- `Cancellation & Retention` admin API routes
- `Cancellation & Retention` Admin UI: queue, detail, apply-offer, finalize, and reason-update flows
- `Cancellation & Retention` backend integration tests
- `Cancellation & Retention` admin flow integration coverage
- smoke-level integration between `Cancellation & Retention`, `Subscriptions`, `Renewals`, and `Dunning`
- `Cancellation & Retention` operational hardening for audit trail, structured logging, and scheduler summary metrics
- `Activity Log` domain model and storage
- `Activity Log` workflow-backed event creation across `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`
- `Activity Log` admin API routes
- `Activity Log` Admin UI: global list, event detail, and per-subscription timeline
- `Activity Log` backend integration tests and admin flow integration coverage
- `Activity Log` operational documentation for retention, monitoring, and roadmap boundaries
- `Analytics` domain model and daily snapshot storage
- `Analytics` admin API routes for KPI, trends, export, and rebuild flows
- `Analytics` Admin UI: dedicated analytics page with filters, KPI cards, trend visualization, and export actions
- `Analytics` backend integration tests and admin flow integration coverage
- `Analytics` cache invalidation integration with `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`

In progress:
- dedicated analytics page and reporting views for `Cancellation & Retention`
- future operational extensions for `Activity Log` such as archival or export

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
- `Dunning`
  - `architecture/dunning.md`
  - `api/admin-dunning.md`
  - `admin/dunning.md`
  - `testing/dunning.md`
- `Cancellation & Retention`
  - `architecture/cancellation.md`
  - `api/admin-cancellations.md`
  - `admin/cancellations.md`
  - `testing/cancellations.md`
- `Activity Log`
  - `architecture/activity-log.md`
  - `api/admin-activity-log.md`
  - `admin/activity-log.md`
  - `testing/activity-log.md`
  - `roadmap/activity-log.md`
- `Analytics`
  - `architecture/analytics.md`
  - `api/admin-analytics.md`
  - `admin/analytics.md`
  - `testing/analytics.md`

## Recommended Reading Order

For a new developer joining the project:
1. Read this file.
2. Read the architecture document for the area you work on.
3. Read the API document for that area.
4. Read the Admin UI document if you touch dashboard flows.
5. Read the testing document before changing behavior.

## Implemented Areas

The currently implemented areas are `Subscriptions`, `Plans & Offers`, `Renewals`, `Dunning`, `Cancellation & Retention`, `Activity Log`, and `Analytics`.

`Activity Log` is now implemented end-to-end as a business audit trail with Admin read APIs, a dedicated Admin page, and a subscription-level timeline.

### Subscriptions

This area includes:
- subscription list in Admin
- subscription details page
- order-detail subscription widget on the standard Medusa order page
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
- automatic `Dunning` case creation for payment-qualified renewal failures
- operational hardening through workflow locking, correlation IDs, structured logs, and scheduler summary metrics

### Dunning

This area includes:
- dunning case list in Admin
- dunning case detail page
- retry-now action
- mark recovered and mark unrecovered actions
- retry schedule override
- scheduler-backed retry execution
- attempt history and linked subscription, renewal, and order summaries
- integration with `Renewals` payment-qualified failures
- integration with `Subscriptions` lifecycle state through `past_due` and recovery back to `active`
- operational hardening through workflow locking, correlation IDs, structured logs, and scheduler summary metrics

### Cancellation & Retention

This area includes:
- cancellation case list in Admin
- cancellation case detail page
- apply retention offer flow for `pause`, `discount`, and `bonus`
- update reason flow
- finalize cancellation flow
- offer history and final outcome timeline
- integration with `Subscriptions` lifecycle state
- integration with `Renewals` through renewal summary and renewal eligibility effects
- integration with `Dunning` through active-case coexistence and linked dunning summary
- operational hardening through audit trail, structured logs, and scheduler summary metrics

### Activity Log

This area includes:
- append-only `subscription_log` storage and workflow-backed event creation
- cross-domain business audit coverage for `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`
- Admin list page with filtering, sorting, pagination, and event detail
- per-subscription timeline on the subscription detail page
- snapshot-first read model and Admin read API routes
- backend coverage for normalization, event creation, API contracts, and admin flow integration

### Analytics

This area includes:
- daily analytics snapshot storage and rebuild workflow support
- KPI reporting for `MRR`, `Churn Rate`, `LTV`, and `Active Subscriptions`
- trends reporting grouped by `day`, `week`, and `month`
- Admin analytics page with filters, KPI cards, trend visualization, and export actions
- Admin API routes for KPI, trends, export, and rebuild flows
- backend coverage for analytics formulas, read models, API contracts, and admin reporting flows

## Notes

- The documents under `specs/` are design-time documents. They are useful for context, but they should not be treated as the final source of truth once implementation evolves.
- The documents in `architecture/`, `api/`, `admin/`, and `testing/` are the runtime source of truth for implemented behavior.
- The implementation plan remains the roadmap for future work, while the runtime documentation should describe the current state of the plugin.
