# Settings Architecture

This document describes the intended architectural boundary for the `Settings` area in the `Reorder` plugin.

It is the runtime source of truth for:
- ownership and source-of-truth rules
- scope of `SubscriptionSettings`
- runtime-read versus persisted-process semantics
- operator-facing effect boundaries for configuration changes

## Goal

The `Settings` area provides global runtime configuration for recurring-commerce behavior managed by the plugin.

Its purpose is to:
- expose a single place for global defaults and policy values
- allow Admin users to manage runtime behavior without redeploying the store
- provide stable configuration inputs to `Subscriptions`, `Renewals`, `Dunning`, and `Cancellation & Retention`

Its purpose is not to:
- become the source of truth for domain state
- retroactively rewrite active subscriptions or process records
- replace persisted operational decisions already stored in domain modules

## Architectural Role

`SubscriptionSettings` are a global runtime policy record.

They are intended to own:
- global default values
- global limits
- global behavior defaults used when a new operation begins

They are not intended to own:
- subscription lifecycle state
- renewal-cycle state
- dunning-case state
- cancellation-case state

This means the `Settings` area is a configuration domain, not an operational domain.

## Scope

For MVP, `SubscriptionSettings` should be:
- global
- singleton
- plugin-wide

This means:
- one active settings record for the entire `Reorder` plugin runtime
- no per-subscription settings record
- no per-product settings record
- no per-store settings record in MVP

The global singleton approach is preferred because:
- the rest of the plugin currently follows one recurring-commerce boundary
- the implemented features do not yet model separate store-level configuration ownership
- it keeps runtime behavior predictable and simpler to operate

## Source-of-Truth Rules

The `Settings` area follows these source-of-truth rules:

- `SubscriptionSettings` are the source of truth for global runtime defaults and policy values.
- Domain modules remain the source of truth for persisted operational state.
- A process-local persisted snapshot takes precedence over a later change to global settings.

This rule is critical.

It prevents a global configuration update from silently rewriting active operational state in:
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

## Relation to Existing Modules

### Relation to `Subscriptions`

`Subscriptions` remain the source of truth for:
- lifecycle state
- cadence
- cancellation-effective semantics
- persisted snapshots on the subscription aggregate

`SubscriptionSettings` may provide:
- default trial values
- future runtime defaults used when creating or preparing new subscription operations

`SubscriptionSettings` must not retroactively rewrite:
- existing subscription records
- existing trial values already persisted on a subscription

### Relation to `Renewals`

`Renewals` remain the source of truth for:
- renewal cycle state
- approval state
- execution outcomes

`SubscriptionSettings` may provide:
- default renewal behavior applied when a new renewal operation begins

`SubscriptionSettings` must not retroactively rewrite:
- already created `RenewalCycle` records
- already persisted renewal decisions or execution state

### Relation to `Dunning`

`Dunning` remains the source of truth for:
- dunning case state
- retry attempt history
- persisted retry schedules on active cases

`SubscriptionSettings` may provide:
- the default retry schedule for newly created dunning cases
- the default maximum-attempt policy used when a new dunning process starts

`SubscriptionSettings` must not retroactively rewrite:
- retry schedules of already active `DunningCase` records
- state that has already been persisted on a dunning process

This is especially important for operational safety.

Changing global dunning settings should not silently mutate recovery flows already in progress.

### Relation to `Cancellation & Retention`

`Cancellation & Retention` remains the source of truth for:
- cancellation case state
- recommendation and outcome state
- persisted retention decisions

`SubscriptionSettings` may provide:
- default cancellation behavior used when a new cancellation flow starts

`SubscriptionSettings` must not retroactively rewrite:
- already open cancellation cases
- already finalized retention or cancellation outcomes

### Relation to `Activity Log`

`Activity Log` remains the source of truth for:
- append-only audit history of settings updates and domain operations

`Settings` should emit audit events for:
- who changed the settings
- when the settings changed
- what fields changed

But `Activity Log` is not the source of truth for the settings record itself.

## Runtime-Read vs Persisted Snapshot Semantics

The `Settings` area should explicitly distinguish between:
- values read at runtime when a new operation starts
- values already snapshotted into an existing process

### Runtime-Read Settings

These are values that should be read from `SubscriptionSettings` when a new operation begins.

Examples:
- default trial behavior for a new subscription-related operation
- default renewal behavior for a newly started renewal path
- default cancellation behavior for a newly opened cancellation flow
- default dunning retry schedule for a newly created dunning case

### Persisted Process Snapshots

Once a workflow has persisted operational state onto a domain entity or process aggregate, that persisted state becomes authoritative for that process.

Examples:
- a `DunningCase.retry_schedule` already stored on an active case
- a recommendation or default path already persisted on a `CancellationCase`
- a renewal execution record already created with its own decision context

In these cases:
- the persisted process state wins
- a later update to global settings does not rewrite that existing process

## Effective-Time Semantics

For MVP, settings changes should apply to:
- future operations
- newly created process state

They should not automatically apply to:
- already persisted subscriptions
- already open dunning cases
- already open cancellation cases
- already created renewal cycles where the relevant decision has been persisted

This is the safest and clearest operator model.

It avoids hidden mass updates and keeps historical process behavior stable.

## Operator Communication Semantics

The Admin UI should communicate the effect boundary clearly.

The intended message is:
- changes apply to future operations
- existing active cases keep their persisted configuration

Recommended wording for the Settings UI:

`Changes apply to future operations and newly created process state. Existing active cases keep their persisted configuration.`

This wording should be reflected in:
- the Settings page save UX
- confirmation messaging for impactful changes
- documentation and testing expectations

## Architectural Decision for MVP

For MVP, the `Settings` area should follow this decision:

- one global singleton `SubscriptionSettings` record
- DB-backed runtime source of truth
- optional fallback defaults only when the record does not yet exist
- settings read at operation start for future work
- no retroactive rewriting of persisted operational state
- process-local persisted snapshots take precedence over later global settings changes

This keeps the feature aligned with:
- Medusa’s module isolation principles
- the existing plugin architecture
- safe operational behavior for `Renewals`, `Dunning`, and `Cancellation & Retention`

## Admin Placement

The Settings UI should live under Medusa Admin `Settings`, not under `Subscriptions`.

This is the correct boundary because:
- the record is global
- the page is configuration-oriented, not queue- or record-oriented
- it matches Medusa’s admin settings-page pattern

## `SubscriptionSettings` Contract

For MVP, the `SubscriptionSettings` record should expose this contract:

- `default_trial_days: number`
- `dunning_retry_intervals: number[]`
- `max_dunning_attempts: number`
- `default_renewal_behavior: SubscriptionRenewalBehavior`
- `default_cancellation_behavior: SubscriptionCancellationBehavior`
- `version: number`
- `updated_by: string | null`
- `updated_at: string`

This contract is intended to be stable across:
- the DB model
- the settings service
- the update workflow
- the Admin API
- the Admin form

## Field Semantics

### `default_trial_days`

`default_trial_days` means:
- the global default trial length in days

Rules:
- integer
- `>= 0`
- `0` means no default trial

This value should be used only when:
- a new operation needs a global trial default

It must not:
- retroactively rewrite trial values already persisted on existing subscriptions

### `dunning_retry_intervals`

`dunning_retry_intervals` means:
- the default retry schedule for newly created dunning processes

The canonical unit for MVP should be:
- minutes

This is preferred because the current dunning runtime already models retry intervals as numeric schedule values compatible with minute-based semantics.

Rules:
- array of positive integers
- strictly increasing
- no zero values
- no negative values
- no duplicate values

Example:
- `[1440, 4320, 10080]`

This value should be used only when:
- a new `DunningCase` or equivalent retry schedule is created

It must not:
- retroactively rewrite retry schedules already persisted on active dunning cases

### `max_dunning_attempts`

`max_dunning_attempts` means:
- the maximum number of retry attempts allowed for newly created dunning processes

Rules:
- positive integer
- should remain consistent with `dunning_retry_intervals`

Recommended MVP rule:
- `max_dunning_attempts === dunning_retry_intervals.length`

This keeps the contract simple and removes ambiguity in how the retry schedule is interpreted.

### `version`

`version` means:
- the monotonic version number of the singleton settings record

It is intended for:
- optimistic locking
- update conflict detection
- operational traceability

Rules:
- integer
- incremented on every successful update

This is not a feature version or product version.

It is only the version of the settings record.

### `updated_by`

`updated_by` means:
- the admin actor or system actor that last updated the settings

Rules:
- `string | null`
- `null` is allowed for bootstrap or default initialization flows

### `updated_at`

`updated_at` means:
- the timestamp of the last successful settings update

It is the source of truth for:
- operator-facing “last updated” information
- audit correlation

## `SubscriptionRenewalBehavior`

For MVP, `default_renewal_behavior` should use this enum:

- `process_immediately`
- `require_review_for_pending_changes`

### `process_immediately`

Meaning:
- when a renewal operation starts and no persisted renewal-specific decision overrides it, the system may treat the renewal as immediately processable from the perspective of global settings

This does not mean:
- bypassing workflow validations
- bypassing offer-policy checks
- bypassing approval rules already stored on a `RenewalCycle`

It is only a global default behavior.

### `require_review_for_pending_changes`

Meaning:
- when a renewal operation starts and there is reviewable change context such as `pending_update_data`, the system should default toward a review/approval path

This does not mean:
- rewriting approval state on an already created `RenewalCycle`
- retroactively changing cycles already persisted in runtime state

## `SubscriptionCancellationBehavior`

For MVP, `default_cancellation_behavior` should use this enum:

- `recommend_retention_first`
- `allow_direct_cancellation`

### `recommend_retention_first`

Meaning:
- when a new cancellation flow starts, the default operator/system posture is to begin with retention-oriented handling

This may influence:
- initial UI defaults
- initial recommendation posture
- default path selection at flow start

This does not mean:
- forcing the customer to accept retention
- preventing final cancellation
- rewriting an already open cancellation case

### `allow_direct_cancellation`

Meaning:
- when a new cancellation flow starts, the system may allow a direct-cancellation path as the default posture

This does not mean:
- bypassing cancellation validations
- auto-canceling without context
- rewriting existing cancellation cases already in progress

## Contract Boundary

This contract should be interpreted as:
- a global runtime policy contract
- not a persisted per-process policy snapshot

That means:
- the settings record defines defaults for future operations
- domain records keep ownership of already persisted operational decisions

## Important MVP Note

`default_renewal_behavior` is valid as a contract field for MVP, but it should only remain in the implemented settings surface if it can be cleanly wired into renewal runtime semantics later without artificial domain stretching.

This must be validated when the runtime integration step is implemented.
