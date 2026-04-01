# Activity Log Architecture

This document describes the architectural boundary decided for the future `Activity Log` area in the `Reorder` plugin.

It documents the source-of-truth and ownership rules agreed before implementation starts.

## Goal

The `Activity Log` area is intended to provide a unified operator-facing audit trail for subscription-related business events across the plugin.

Its purpose is to:
- show important lifecycle events for one subscription in one place
- give operators a readable audit trail across multiple recurring-commerce areas
- support future Admin list, detail, and timeline views

Its purpose is not to replace the source domain models that already own their own business state.

## Architectural Role

`Activity Log` is planned as a dedicated append-only business audit layer.

It should aggregate important subscription-related events emitted by:
- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`

The key architectural decision is:

- `Activity Log` is the canonical append-only audit trail for operator-facing business events around a subscription.
- `Activity Log` is not the source of truth for domain state owned by the existing modules.

This means the log is a cross-domain audit view, not a replacement for existing aggregates.

## Ownership Boundaries

The current ownership model of the plugin remains unchanged.

`Subscriptions` remain the source of truth for:
- subscription lifecycle state
- cadence and renewal scheduling fields
- shipping address and pending plan change materialization

`Plans & Offers` remain the source of truth for:
- subscription offer configuration
- allowed billing frequencies
- offer rules and effective policy resolution

`Renewals` remain the source of truth for:
- renewal cycle execution state
- renewal attempt history
- approval decisions and execution outcomes

`Dunning` remains the source of truth for:
- payment recovery state
- retry schedule
- dunning attempt history
- recovered and unrecovered outcomes

`Cancellation & Retention` remains the source of truth for:
- cancellation process state
- retention recommendation state
- retention offer history
- churn reason and final cancellation outcome

`Activity Log` does not take ownership away from any of the above modules.

## Relation to Existing Audit Fields and Metadata

The plugin already stores audit-oriented data inside domain-specific modules.

Examples include:
- explicit actor fields such as `finalized_by`, `decided_by`, and approval-related fields
- append-only `manual_actions` metadata in `Cancellation & Retention`
- renewal and dunning attempt history
- workflow-specific metadata and manual-operation context

These fields remain valid and should stay in their owning modules.

The architectural role of `Activity Log` is different:
- domain modules keep detailed, module-local audit context
- `Activity Log` provides a unified cross-domain audit trail for operators

This means:
- `Activity Log` may summarize or reference important outcomes from those modules
- it should not replace detailed attempt history or module-specific metadata
- it should not become a dumping ground for every internal field or diagnostic value

## Business Audit Trail vs Operational Logging

The plugin already uses structured operational logging and scheduler summary metrics in areas such as `Renewals`, `Dunning`, and `Cancellation & Retention`.

Those operational logs remain a separate concern.

`Activity Log` should contain only business-significant, operator-facing events, such as:
- subscription paused, resumed, canceled
- plan change scheduled or applied
- shipping address updated
- renewal attempted, succeeded, failed
- dunning started, retried, recovered, unrecovered
- cancellation case started
- retention offer applied
- cancellation finalized

`Activity Log` should not contain low-level operational or diagnostic noise, such as:
- scheduler heartbeat and batch summaries
- lock-acquisition diagnostics
- retry internals and step-level debug output
- infrastructure or transport-layer errors
- sensitive payment details

Those concerns belong in structured logs, observability helpers, and operational metrics, not in the business audit trail.

## Medusa Boundary Rules

The decision follows Medusa's modular architecture rules:
- domain modules stay isolated
- cross-module business coordination happens in workflows
- read models can aggregate data for Admin without transferring ownership between modules

For `Activity Log`, this means:
- log entries should be created from workflow-backed mutation paths
- module services should keep owning their own state
- the future Admin read layer may aggregate events across domains, but it must not redefine domain ownership

## Summary

The agreed boundary for `Activity Log` is:

- it is a canonical append-only business audit trail for subscription-related events
- it is not the source of truth for subscription, renewal, dunning, or cancellation state
- existing module-local audit fields and histories remain in place
- structured operational logs remain separate from the business audit trail
- cross-domain event recording should happen through workflow orchestration, consistent with Medusa patterns
