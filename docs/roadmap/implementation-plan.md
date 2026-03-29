# Reorder Roadmap

`Reorder` is a Medusa.js plugin focused on recurring commerce operations managed from the Admin.

This roadmap is the public implementation plan for the project. It is intended for open-source users and contributors who want to understand what is already available, what is being built next, and how the plugin is expected to evolve.

This document describes product direction, not a promise of delivery dates.

## Current Status

The first two major areas of the plugin, `Subscriptions` and `Plans & Offers`, are complete and tested.

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

Planned next:
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

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

Status: `Planned`

This area will cover recurring order generation and renewal operations.

Planned scope:
- renewal cycle tracking
- scheduled and manual renewal execution
- approval flow for pending subscription changes before renewal
- admin queue and detail views for renewal operations
- integration tests for success, failure, retry, and approval scenarios

This area will provide the operational execution layer for active subscriptions.

### 4. Dunning

Status: `Planned`

This area will manage failed renewal payments and retry flows.

Planned scope:
- dunning case tracking
- retry scheduling and retry execution
- manual recovery actions in Admin
- admin views for case monitoring and handling
- operational visibility around payment recovery

This area will reduce churn caused by payment failures and improve recovery workflows.

### 5. Cancellation & Retention

Status: `Planned`

This area will focus on churn handling and retention workflows.

Planned scope:
- structured cancellation reasons
- retention offer flows before final cancellation
- admin tools for pause, discount, or other save actions
- reporting inputs for churn analysis

This area will support more deliberate offboarding and retention decisions.

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
