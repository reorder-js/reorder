# Reorder Roadmap

`Reorder` is a Medusa.js plugin focused on recurring commerce operations managed from the Admin.

This roadmap is the public implementation plan for the project. It is intended for open-source users and contributors who want to understand what is already available, what is being built next, and how the plugin is expected to evolve.

This document describes product direction, not a promise of delivery dates.

## Current Status

The first seven major areas of the plugin, `Subscriptions`, `Plans & Offers`, `Renewals`, `Dunning`, `Cancellation & Retention`, `Activity Log`, and `Analytics`, are complete and tested.

Implemented today:
- subscription domain model and storage
- admin API routes for list, detail, and subscription actions
- Admin UI for subscription list and detail flows
- pause, resume, and cancel actions
- schedule plan change
- edit shipping address
- filtering, sorting, pagination, and UI state handling
- backend integration tests and admin flow integration coverage
- plan offer domain model and storage
- admin API routes for plan offer list, detail, create, update, and toggle
- Admin UI for plans and offers management
- effective config resolution with `variant > product` semantics
- backend integration tests and admin flow integration coverage for `Plans & Offers`
- smoke-level integration between `Plans & Offers` and `Subscriptions`
- renewal cycle domain model and storage
- admin API routes for renewal queue, detail, force, approve, and reject flows
- Admin UI for renewals queue and detail flows
- approval, rejection, and force execution actions in Admin
- backend integration tests and admin flow integration coverage for `Renewals`
- smoke-level integration between `Renewals`, `Subscriptions`, and `Plans & Offers`
- production hardening for renewal scheduler and manual execution flows
- dunning case domain model and storage
- admin API routes for dunning list, detail, retry-now, mark recovered, mark unrecovered, and retry schedule override
- Admin UI for dunning queue and detail flows nested under `Subscriptions`
- scheduler-backed and manual dunning retry execution
- backend integration tests and admin flow integration coverage for `Dunning`
- smoke-level integration between `Dunning`, `Renewals`, and `Subscriptions`
- production hardening for dunning scheduler and manual retry flows
- analytics daily snapshot domain model and storage
- admin API routes for analytics KPI, trends, export, and rebuild flows
- Admin UI for the analytics reporting page nested under `Subscriptions`
- backend integration tests and admin flow integration coverage for `Analytics`
- cross-module cache invalidation hooks so reporting stays aligned after subscription lifecycle mutations

Planned next:
- dedicated analytics page and reporting views for `Cancellation & Retention`

## Product Areas

### 1. Subscriptions

Status: `Completed`

This area provides the operational foundation for recurring commerce in the Admin. It includes:
- a subscriptions list view with filtering, sorting, pagination, and row actions
- a subscription details view
- operational actions such as pause, resume, and cancel
- pending plan change preview and scheduling
- shipping address editing
- supporting API routes, workflows, and tests

This area is considered the current stable base for the plugin.

### 2. Plans & Offers

Status: `Completed`

This area defines which products and variants can be sold as subscriptions and under which terms.

Implemented scope:
- product and variant level subscription configuration
- allowed billing frequencies
- offer-level discount configuration
- additional offer rules such as trial and stacking settings
- effective config resolution with `variant > product` priority
- admin management UI for plans and offers
- workflow-backed mutations and validation for supported combinations
- backend integration tests and admin flow coverage
- integration with `Subscriptions` plan-change validation

This area provides the commercial configuration layer used by subscriptions and future storefront work.

### 3. Renewals

Status: `Completed`

This area covers recurring renewal execution and renewal operations in Admin.

Implemented scope:
- renewal cycle tracking
- scheduled and manual renewal execution
- approval flow for pending subscription changes before renewal
- Admin queue and detail views for renewal operations
- approve, reject, and force actions in Admin
- backend integration tests for success, failure, retry, approval, idempotency, and route behavior
- admin flow integration coverage
- smoke-level integration with `Subscriptions` and `Plans & Offers`
- production hardening through workflow locking, correlation IDs, structured logging, and scheduler summary metrics

This area provides the operational execution layer for active subscriptions.

### 4. Dunning

Status: `Completed`

This area manages failed renewal payments and retry flows.

Implemented scope:
- dunning case tracking
- retry scheduling and retry execution
- manual recovery actions in Admin
- admin queue and detail views nested under `Subscriptions`
- retry-now, mark recovered, mark unrecovered, and retry schedule override actions
- backend integration tests for workflow, route, and admin flow behavior
- smoke-level integration with `Renewals` and `Subscriptions`
- production hardening through locks, correlation IDs, structured logging, and scheduler summary metrics

This area reduces churn caused by payment failures and provides a dedicated payment recovery workflow for failed renewals.

### 5. Cancellation & Retention

Status: `Completed`

This area focuses on churn handling and retention workflows.

Implemented scope:
- cancellation case domain model and storage
- retention offer event domain model and storage
- source-of-truth boundaries with `Subscriptions`, `Renewals`, and `Dunning`
- structured churn reason and reason-category handling
- smart cancellation recommendation workflow
- retention offer flows for `pause`, `discount`, and `bonus`
- final cancellation workflow with required reason semantics
- admin API routes for cancellation list, detail, recommendation, offer application, finalization, and reason updates
- Admin UI for cancellation queue and case detail under `Subscriptions`
- backend integration tests, admin flow integration coverage, and cross-module smoke coverage
- operational hardening through audit trail, structured logging, scheduler summary metrics, and churn-spike alertable logs

Deferred scope:
- dedicated analytics page and reporting views for churn KPIs

This area now supports deliberate offboarding and retention decisions through workflow-backed Admin operations.

### 6. Activity Log

Status: `Completed`

This area provides a cross-domain business audit trail for subscription operations.

Implemented scope:
- append-only `subscription_log` domain model and storage
- workflow-backed event creation across `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`
- centralized normalization, redaction, and idempotent write semantics
- admin API routes for:
  - global list
  - event detail
  - per-subscription timeline
- Admin UI for:
  - global activity-log page
  - event detail drawer
  - subscription detail timeline
- backend tests for normalization, write semantics, and emitted event payloads
- admin API and admin-flow integration coverage
- operational documentation for retention, monitoring, and future extension boundaries

Deferred scope:
- archival or retention jobs
- export tooling
- saved filters and richer cross-linking

This area now provides the operator-facing audit trail for subscription lifecycle events without taking ownership away from the underlying domain modules.

### 7. Analytics

Status: `Completed`

This area provides reporting-oriented KPI and trend views for recurring-commerce operations in Admin.

Implemented scope:
- derived analytics snapshot model for daily recurring-commerce facts
- Admin API routes for:
  - KPI summary
  - trends
  - export
  - rebuild
- Admin UI for:
  - analytics page nested under `Subscriptions`
  - filter-driven KPI cards
  - trend visualization
  - on-demand CSV and JSON export
- backend tests for formulas, bucket semantics, filters, rebuild behavior, and route contracts
- admin flow integration coverage for analytics reporting scenarios
- cache invalidation integration with `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`

Deferred scope:
- dedicated cancellation-specific analytics page and reporting views for churn-operations drill-down
- compare-period reporting
- saved views
- async export queueing

This area now provides the core reporting surface for recurring-commerce KPI review without taking ownership away from the source domain modules.

## Roadmap Principles

The roadmap follows a few project-level principles:

- Build domain-first.
  Business rules live in Medusa modules and workflows before they are exposed in the Admin UI.
- Keep Admin behavior aligned with Medusa patterns.
  Tables, detail pages, drawers, actions, and data loading should follow Medusa conventions.
- Prefer stable read models and explicit mutation flows.
  List and detail views should be backed by clear query contracts and workflow-driven mutations.
- Test at the integration boundary.
  Each area should be validated through official Medusa-supported integration tests.
- Ship in vertical slices.
  Each major area should be complete across domain model, API, Admin UI, and testing before the next one is considered done.

## What "Done" Means

An area is considered complete when it includes:
- a stable domain model
- migrations and indexes where needed
- admin-facing API routes
- Admin UI for the intended workflows
- validation and domain error handling
- integration tests covering the critical paths
- up-to-date documentation

## Contribution Notes

If you want to contribute:

- treat the documents in `architecture/`, `api/`, `admin/`, and `testing/` as the source of truth for implemented behavior
- treat `specs/` as historical design context, not final documentation
- align new Admin UI with established Medusa dashboard patterns
- prefer small, complete slices over broad partially implemented changes

## Related Documents

- [Docs Overview](../README.md)
- [Subscriptions Architecture](../architecture/subscriptions.md)
- [Admin Subscriptions API](../api/admin-subscriptions.md)
- [Admin Subscriptions UI](../admin/subscriptions.md)
- [Subscriptions Testing](../testing/subscriptions.md)
- [Plans & Offers Architecture](../architecture/plan-offers.md)
- [Admin Plans & Offers API](../api/admin-plan-offers.md)
- [Admin Plans & Offers UI](../admin/plan-offers.md)
- [Plans & Offers Testing](../testing/plan-offers.md)
- [Cancellation Architecture](../architecture/cancellation.md)
- [Admin Cancellations API](../api/admin-cancellations.md)
- [Admin Cancellations UI](../admin/cancellations.md)
- [Cancellations Testing](../testing/cancellations.md)
- [Dunning Architecture](../architecture/dunning.md)
- [Admin Dunning API](../api/admin-dunning.md)
- [Admin Dunning UI](../admin/dunning.md)
- [Dunning Testing](../testing/dunning.md)
- [Activity Log Architecture](../architecture/activity-log.md)
- [Admin Activity Log API](../api/admin-activity-log.md)
- [Admin Activity Log UI](../admin/activity-log.md)
- [Activity Log Testing](../testing/activity-log.md)
- [Activity Log Roadmap](./activity-log.md)
- [Analytics Architecture](../architecture/analytics.md)
- [Admin Analytics API](../api/admin-analytics.md)
- [Admin Analytics UI](../admin/analytics.md)
- [Analytics Testing](../testing/analytics.md)
