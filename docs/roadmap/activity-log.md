# Activity Log Roadmap

This document describes the follow-up roadmap for the `Activity Log` area after the current v1 implementation.

It is intentionally shorter than the main project roadmap and focuses only on next-step enhancements for this area.

## Current Status

`Activity Log` v1 is implemented and includes:
- append-only `subscription_log` storage
- workflow-backed event emission
- Admin read API
- global Admin list
- event detail drill-down
- per-subscription timeline
- backend and integration test coverage

## Current Operating Model

The current operating model is intentionally conservative:
- snapshot-first read model
- no automatic retention cleanup
- no export tooling
- no personalized filtering features

This is a deliberate v1 boundary, not an oversight.

## Next Logical Enhancements

### 1. Retention and Archival

Potential future work:
- explicit archival job
- explicit purge policy
- operator-visible retention configuration

This should only be implemented when:
- storage growth becomes operationally significant
- compliance or customer policy requires it

### 2. Export

Potential future work:
- CSV export for filtered log views
- export of one subscription timeline

This would be useful for:
- support operations
- incident review
- customer-success workflows

### 3. Richer Cross-Linking

Potential future work:
- direct links from event detail to related:
  - renewal detail
  - dunning case detail
  - cancellation case detail

This should stay light and should not turn the read model into heavy runtime enrichment.

### 4. Saved Filters and Presets

Potential future work:
- persistent operator presets
- team-level filtered views

This is useful only after the base list is proven operationally stable.

### 5. Operational Review

Potential future work:
- revisit indexes if query volume grows
- revisit search behavior if the current snapshot-first search becomes too limited
- add explicit dashboards or alerting once operational baselines are known

## Non-Goals for the Next Iteration

The next iteration should still avoid:
- turning `Activity Log` into general telemetry
- storing full aggregate snapshots
- embedding deep linked state from every domain in each read response

The area should stay a business audit trail first.
