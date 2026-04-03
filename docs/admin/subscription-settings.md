# Admin UI: Subscription Settings

This document describes the implemented Admin UI for the `Subscription Settings` area in the `Reorder` plugin.

It focuses on:
- page placement
- form behavior
- save flow
- runtime-effect messaging
- current UX boundaries

## Purpose

The `Subscription Settings` page gives operators one place to manage global recurring-commerce defaults for:
- trials
- dunning retry policy
- renewal behavior
- cancellation defaults

The page is intended to support:
- safe global configuration changes
- clear save feedback
- predictable “future operations only” semantics

## Route Map

Implemented route:
- `/app/settings/subscription-settings`

Navigation behavior:
- the page lives under the Medusa Admin `Settings` area
- it is a dedicated configuration page, not a subscription detail subpanel

## 1. Page Structure

The current page includes:
- page header and description
- info panel for persisted settings state
- settings form
- save action area
- warning and helper messaging

The layout follows current Medusa Admin conventions:
- `Container` sections
- compact settings-page structure
- no modal-driven primary flow

## 2. Form Sections

The current form is split into four sections:
- `Trial`
- `Dunning`
- `Renewals`
- `Cancellation Defaults`

### Trial

Current field:
- `default_trial_days`

### Dunning

Current fields:
- `dunning_retry_intervals`
- `max_dunning_attempts`

Retry intervals are edited as an ordered list of values in minutes.

### Renewals

Current field:
- `default_renewal_behavior`

Supported values:
- `process_immediately`
- `require_review_for_pending_changes`

### Cancellation Defaults

Current field:
- `default_cancellation_behavior`

Supported values:
- `recommend_retention_first`
- `allow_direct_cancellation`

## 3. Data Loading

The page follows the Medusa Admin display-query pattern.

Current behavior:
- the effective settings payload loads on mount
- the page uses a dedicated settings query helper
- save uses a separate mutation helper
- successful save invalidates the settings query
- display reads are not tied to incidental local UI state

The page currently does not depend on:
- modal state
- drawer state
- conditional `enabled` flags unrelated to the settings query itself

## 4. Save UX

The current save experience includes:
- disabled `Save` button when there are no changes
- loading and disabled state while save is in progress
- inline form validation
- toast success and error feedback
- info panel showing:
  - `version`
  - `updated_at`
  - `updated_by`

## 5. Runtime-Effect Messaging

The page intentionally communicates the settings boundary clearly.

Current messaging emphasizes:
- changes apply to future operations
- newly created process state will use the saved configuration
- existing active dunning, cancellation, and renewal process state keeps its persisted configuration

This is aligned with the implemented runtime semantics:
- `DunningCase` snapshots settings when created
- `CancellationCase` snapshots settings when created
- `RenewalCycle` uses settings at create time and keeps its persisted policy context

## 6. Warning Behavior

The page shows a warning-oriented summary for pending impactful changes.

The intent is to make global changes more explicit when the operator edits fields that affect:
- dunning behavior
- renewal behavior
- cancellation defaults

The current UX keeps this as an inline warning block instead of a blocking confirm modal.

## 7. Persisted State Indicators

The page reflects whether the current settings are:
- fallback defaults
- persisted singleton state

Key indicators visible to the operator:
- `version`
- `updated_at`
- `updated_by`

These values help distinguish:
- first-time bootstrap behavior
- already persisted runtime configuration

## 8. Current UX Boundaries

The current Settings page intentionally does not include:
- reset action
- settings changelog browser
- compare-two-versions UI
- dedicated permission-management UI
- inline runtime previews for all modules

The implemented UX priorities are:
- consistency with Medusa Admin settings pages
- safe global configuration edits
- clear communication of scope and effect
