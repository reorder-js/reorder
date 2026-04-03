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

## Audit Trail and Changelog

For MVP, `SubscriptionSettings` use a lightweight changelog model.

The implemented audit trail consists of:
- scalar record fields:
  - `version`
  - `updated_by`
  - `updated_at`
- `metadata.audit_log` as the persisted change history
- `metadata.last_update` as a convenience snapshot of the latest change
- structured operational log events:
  - `settings.update`

### MVP Decision

For MVP, `metadata.audit_log` is the changelog.

This means:
- we do not add a separate append-only `settings_change` entity yet
- we do not add a dedicated settings-history table yet
- the settings record remains the source of truth for current configuration
- `metadata.audit_log` remains the source of truth for lightweight change history

This is intentional.

Unlike:
- renewal execution history
- dunning retry attempt history
- retention offer history
- subscription business events in `Activity Log`

settings version history is not yet a standalone operational domain with independent query or workflow requirements.

### Audit Record Contract

Each `metadata.audit_log` entry should use the same stable contract:
- `action`
- `who`
- `when`
- `reason`
- `previous_version`
- `next_version`
- `change_summary`

`change_summary` is intended to stay compact and operator-readable.

For MVP it should describe:
- which fields changed
- the previous scalar or list value
- the next scalar or list value

It should not attempt to store:
- full historical copies of the entire settings record
- arbitrary metadata diffs
- separate history rows detached from the settings aggregate

### Role of `version`

`version` is not the changelog itself.

It exists primarily for:
- optimistic locking
- ordering changes
- correlating audit entries with persisted updates

Historical readability comes from:
- `metadata.audit_log`
- `metadata.last_update`
- `settings.update` structured logs

### Future Escalation Path

If later requirements include:
- browsing long settings history in Admin
- filtering by actor or change type
- retention and pagination rules for history
- separate query endpoints for configuration history
- compliance-driven append-only storage

then the correct next step is a dedicated append-only `settings_change` record.

That future model would complement the singleton settings record rather than replace it.

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

## Runtime Source of Truth and Bootstrap

The implemented runtime source of truth is:
- persisted singleton `subscription_settings` record in the `settings` module

Current bootstrap semantics:
- the database record is the primary runtime source of truth
- fallback defaults are used only when the singleton record does not yet exist
- `GET /admin/subscription-settings` returns effective settings, not `404`
- the singleton is created lazily on first successful update

Once the persisted record exists:
- fallback defaults are no longer authoritative
- runtime reads use the stored singleton

## Implemented Persistence Model

The current persistence model is:
- one global singleton record
- keyed by `settings_key = "global"`
- unique singleton semantics enforced at the data-model level

The persisted record stores:
- `default_trial_days`
- `dunning_retry_intervals`
- `max_dunning_attempts`
- `default_renewal_behavior`
- `default_cancellation_behavior`
- `version`
- `updated_by`
- `updated_at`
- `metadata`

The current implementation does not support:
- per-store settings
- per-product settings
- multi-tenant settings ownership

## Service and Update Semantics

The implemented service boundary provides:
- `getSettings()`
- `updateSettings()`
- `resetSettings()`

Current behavior:
- `getSettings()` returns effective settings even when no persisted record exists
- `updateSettings()` performs lazy-create on first write
- `updateSettings()` increments `version` on every successful persisted update
- `resetSettings()` removes the persisted singleton and returns effective fallback defaults

Validation and normalization are currently applied in the settings module before persistence:
- `default_trial_days >= 0`
- `max_dunning_attempts > 0`
- `dunning_retry_intervals` must be positive integers
- retry intervals must be strictly increasing
- `max_dunning_attempts` must match the number of retry intervals

## Workflow and Optimistic Locking

Settings writes are implemented through the dedicated workflow:
- `update-subscription-settings`

Current workflow responsibilities:
- load current effective settings
- validate `expected_version`
- persist the next settings state
- append audit metadata
- emit structured `settings.update` logs
- compensate on failure

Optimistic locking uses:
- `expected_version`

Current rules:
- first persisted write expects `0`
- later writes must match the current persisted `version`
- version mismatch returns a conflict

Compensation semantics:
- if a new settings record was created and a later step fails, rollback returns to fallback state
- if an existing singleton was updated and a later step fails, rollback restores the previous persisted state

## Implemented Runtime Wiring

The current runtime integration is intentionally scoped to create-time or operation-start behavior.

### Dunning

`Dunning` reads effective settings when a new `DunningCase` is created.

Current usage:
- default retry schedule
- default maximum attempts

These values are snapshotted into the created case metadata as:
- `metadata.settings_policy`

Existing active dunning cases are not rewritten when global settings later change.

### Cancellation

`Cancellation & Retention` read effective settings when a new `CancellationCase` is created.

Current usage:
- default cancellation behavior snapshot

The chosen policy is stored on the case metadata.

Existing active cancellation cases are not rewritten when global settings later change.

### Renewals

`Renewals` read effective settings when a new upcoming `RenewalCycle` is created.

Current usage:
- default renewal behavior at create time

The chosen behavior is snapshotted into cycle metadata.

Existing cycles are not retroactively rewritten just because global settings changed.

If an existing cycle later needs approval-state recomputation because the subscription changed, it is recomputed using the cycle’s persisted settings policy, not the latest global settings by default.

## Admin Surface and Data Loading

The implemented Admin page lives under:
- `/app/settings/subscription-settings`

The UI follows current Medusa Admin page conventions:
- display query loaded on mount
- mutation-backed save flow
- inline validation
- warning and impact messaging
- query invalidation after update

The page communicates the intended effect boundary:
- changes apply to future operations
- existing active process state keeps its persisted configuration

## Current MVP Boundaries

The current implementation intentionally does not include:
- dedicated append-only `settings_change` storage
- separate settings history queries
- reset endpoint in the Admin API
- role-based route restriction beyond authenticated admin access
- per-store configuration

These remain future expansion points rather than current runtime requirements.

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

## Source of Truth and Bootstrap

For MVP, the `Settings` area should use a single runtime source of truth hierarchy:

1. persisted database record
2. fallback defaults only when the record does not exist

This hierarchy must remain explicit and deterministic.

## Primary Source of Truth

The primary source of truth for `SubscriptionSettings` should be:
- a singleton record stored in the database

This database record should be treated as:
- the canonical runtime configuration
- the record used by Admin updates
- the source used by workflows and jobs once it exists

This is preferred because:
- Admin users need runtime-editable configuration
- settings should not require a deploy to change
- the configuration should be auditable and versioned

## Role of `env` and Static Config

`env` or static config should not be treated as a second equal source of truth.

For MVP, `env/config` may only be used as:
- bootstrap fallback defaults

This means:
- if no settings record exists in the database, effective settings may be built from fallback defaults
- if a settings record exists in the database, that record always wins

After a record exists in the database:
- `env/config` is no longer authoritative at runtime

This avoids split-brain configuration behavior.

## `GET` Behavior When Record Is Missing

If no settings record exists yet:
- `GET /admin/subscription-settings` should not return `404`

Instead, it should return:
- an effective settings payload
- built from defaults and optional fallback config

This gives Admin operators:
- a usable settings page on first boot
- predictable initial values
- no special “missing record” error state

At the contract level, the response should later distinguish between:
- persisted settings
- fallback effective settings

Examples of acceptable future response metadata:
- `is_persisted: boolean`
- or `source: "database" | "fallback"`

## Bootstrap Strategy

For MVP, the singleton settings record should not be created by migration.

Recommended strategy:
- lazy-create on first update

Reasons:
- migrations are the wrong place for business defaults that may vary by environment
- this keeps plugin installation simpler
- fallback defaults remain usable even before the first write
- there is no need to couple database schema creation with business-policy insertion

This means:
- the system can start without an existing `subscription_settings` row
- Admin `GET` still works through fallback effective settings
- the first successful `POST` creates the canonical singleton record

## Effective Settings Semantics

The system should distinguish between:
- persisted settings
- effective fallback settings

### Persisted Settings

Persisted settings mean:
- a database record exists
- it is authoritative
- it carries real persisted `version`, `updated_by`, and `updated_at`

### Effective Fallback Settings

Effective fallback settings mean:
- no database record exists yet
- the system builds an effective payload from defaults and optional config
- the payload is readable but not yet persisted

Recommended MVP semantics for fallback payloads:
- `version = 0`
- `updated_by = null`
- `updated_at = null`

This keeps the contract honest and makes it clear that no persisted change has happened yet.

## Precedence Rules

The precedence rules for `SubscriptionSettings` should be:

1. if a database record exists, use it
2. if no database record exists, use effective fallback defaults
3. an update creates or updates the database singleton
4. after the singleton exists, fallback config no longer overrides runtime behavior

These rules must remain stable across:
- the settings service
- the update workflow
- Admin API behavior
- runtime reads in domain workflows

## Architectural Decision for MVP

For MVP, the final source-of-truth and bootstrap decision is:

- `subscription_settings` in DB is the primary runtime source
- fallback defaults are allowed only before the singleton exists
- `GET` returns effective settings, not `404`
- the singleton is lazy-created on first update
- once persisted, the database record becomes the only authoritative runtime source
