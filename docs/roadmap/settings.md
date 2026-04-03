# Roadmap: Subscription Settings

This document captures the current MVP boundaries and the planned evolution of the `Subscription Settings` area in the `Reorder` plugin.

It is intended to clarify:
- what is implemented today
- what is intentionally out of scope for MVP
- which next steps are most likely after MVP stabilization

## Current MVP Boundaries

The current MVP intentionally stops at a lightweight global settings implementation.

Implemented today:
- one global singleton settings record
- fallback defaults when no persisted record exists
- workflow-backed updates with optimistic locking
- audit trail in `metadata.audit_log`
- runtime integration for:
  - `Dunning`
  - `Cancellation`
  - `Renewals`
- Admin Settings page for read and update flows

The MVP intentionally does not include the following extensions.

### 1. Reset Endpoint

Current state:
- the module service supports `resetSettings()`
- the public Admin API does not expose a reset route
- the Admin page does not expose a reset action

Why it is out of scope in MVP:
- reset is a global operation and deserves a dedicated UX and mutation contract
- a reset action should be explicit about its effect on future operations
- the current save flow is safer without a destructive reset button

### 2. Richer Permission Model

Current state:
- routes rely on authenticated Admin access
- there is no dedicated settings-specific permission gate yet

Why it is out of scope in MVP:
- the repository does not yet provide a shared custom-route RBAC pattern for plugin-owned Admin routes
- adding a full permission model only for `Subscription Settings` would introduce a new cross-cutting concern late in MVP

### 3. Dedicated Changelog or History Model

Current state:
- `metadata.audit_log` acts as the changelog
- `metadata.last_update` provides a convenience snapshot of the latest change
- `version` supports optimistic locking and ordering

Why it is out of scope in MVP:
- settings history is not yet a standalone operational domain
- there is no current need for separate history queries, retention policies, or paginated Admin history APIs

### 4. Per-Store Settings

Current state:
- the implementation is one global singleton
- the scope is plugin-wide, not per store or tenant

Why it is out of scope in MVP:
- the rest of the plugin currently follows one global recurring-commerce boundary
- the existing Admin and runtime semantics are simpler and safer with one global source of truth

### 5. Advanced Audit Browsing in Admin

Current state:
- the Settings page shows current record state
- there is no dedicated changelog timeline, history table, or diff viewer in Admin

Why it is out of scope in MVP:
- the current operator need is global configuration editability, not historical browsing
- adding history browsing would imply stronger requirements around pagination, filtering, and access control

## Future Roadmap

The following are the most natural next steps after MVP stabilization.

### 1. Add Reset API and Admin UX

Candidate future additions:
- `POST /admin/subscription-settings/reset`
- dedicated reset workflow
- explicit confirmation UX on the Settings page
- messaging for fallback-default reactivation

Expected design goal:
- make reset safe, explicit, and reversible at the operational level

### 2. Add a Richer Permission Model

Candidate future additions:
- settings-specific role or permission gate
- separate access levels for read versus write
- shared guard helpers for plugin custom Admin routes

Expected design goal:
- restrict global configuration access to a smaller operator set
- avoid scattering route-specific permission logic across custom endpoints

### 3. Add a Dedicated Append-Only History Model

Candidate future additions:
- new `settings_change` or similar append-only record
- explicit actor, version, reason, and diff payload per change
- history query endpoint and Admin view support

Expected design goal:
- support stronger auditability, longer history retention, and easier changelog browsing

### 4. Add Per-Store Settings Scope

Candidate future additions:
- `store_id`-scoped settings records
- resolution rules for current store context
- Admin UX for scoped configuration ownership

Expected design goal:
- support multi-store or more complex tenant-aware recurring-commerce setups without rewriting current global semantics blindly

### 5. Add Advanced Admin Audit Browsing

Candidate future additions:
- settings changelog timeline
- version comparison
- filter by actor or changed field
- “last changed by” drilldown

Expected design goal:
- make configuration history operator-friendly once settings changes become a higher-volume operational concern

## Decision Summary

The current roadmap direction for `Subscription Settings` is:
- keep MVP small and global
- keep audit history lightweight but useful
- defer destructive reset UX
- defer standalone history storage
- defer richer permission and scoping models

This is consistent with the current plugin maturity level and with the architecture already chosen for the Settings feature.
