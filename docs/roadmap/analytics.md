# Analytics Roadmap

This document describes the follow-up roadmap for the `Analytics` area after the current MVP implementation.

It focuses on:
- current MVP boundaries
- consciously deferred capabilities
- next logical enhancements for reporting and operations

## Current Status

`Analytics` MVP is implemented and includes:
- daily `subscription_metrics_daily` snapshots
- shared rebuild workflow
- scheduled rebuild job
- incremental rebuild triggers for selected domain workflows
- Admin read API for KPI, trends, export, and manual rebuild
- Admin Analytics page with filters, KPI cards, trends, and export
- module, workflow, route, and admin-flow test coverage
- data quality checks, metrics versioning, and structured observability

## Current MVP Boundaries

The current implementation is intentionally conservative.

It currently assumes or limits:
- one valid reporting currency per result set for `MRR` and `LTV`
- synchronous export only
- threshold-based anomaly checks
- no compare-period UI
- no advanced segmentation beyond the current filters

These boundaries are deliberate MVP choices, not accidental omissions.

## 1. Multi-Currency Reporting

Current limitation:
- `MRR` and `LTV` become `null` for mixed-currency datasets without a valid single-currency basis

Potential future work:
- explicit reporting-currency filter
- FX normalization strategy
- persisted normalization snapshots or exchange-rate references
- clear contract for mixed-currency exports and charting

This should only be implemented with a documented business rule for:
- rate source
- rate timing
- rebuild/backfill behavior after FX rule changes

## 2. Async Export

Current limitation:
- exports are synchronous and returned directly from the Admin export endpoint

Potential future work:
- workflow-backed async export
- background processing for large ranges
- downloadable export history
- operator-visible export status

This becomes valuable when:
- range sizes grow
- export volume increases
- synchronous export starts to affect request latency

## 3. Richer Anomaly Detection

Current limitation:
- quality checks are threshold-based and intentionally simple

Current checks focus on:
- `MRR` spikes and drops
- `churn_rate` spikes
- empty or incomplete snapshot days

Potential future work:
- compare against rolling baselines
- week-over-week and month-over-month anomaly rules
- anomaly severity scoring
- richer reconciliation checks against source-domain counts
- explicit operator-facing anomaly surfaces in Admin

This should remain explainable.

The reporting layer should avoid opaque anomaly scoring that cannot be justified operationally.

## 4. Compare Periods

Current limitation:
- the dashboard computes previous-window comparisons for KPI deltas internally, but there is no dedicated compare-period operator workflow in the UI

Potential future work:
- explicit compare period selector
- previous period overlays in trends
- compare-to-last-week / last-month presets
- compare-aware export payloads

This should be added only if it stays visually consistent with Medusa Admin patterns and does not overload the dashboard.

## 5. Richer Segmentation

Current limitation:
- segmentation is limited to:
  - date range
  - subscription status
  - product
  - frequency
  - bucket grouping

Potential future work:
- segmentation by customer cohorts
- segmentation by plan or offer
- segmentation by dunning or churn outcome
- top-level breakdown widgets by product, cadence, or reason category

This should be implemented only after confirming that the snapshot model and indexes remain efficient for the expanded dimensions.

## 6. Future Operational Enhancements

Potential future work:
- stronger alert integration on top of structured analytics logs
- explicit dashboards for rebuild latency and quality-check findings
- configurable anomaly thresholds
- snapshot backfill tooling with operator-visible progress

These improvements should build on the current structured observability model rather than replacing it.

## Non-Goals for the Next Iteration

The next iteration should still avoid:
- turning analytics into a second source of truth for lifecycle state
- mixing heavy live cross-module joins back into the Admin read path
- introducing hidden FX behavior without explicit business approval
- overcomplicating anomaly detection before the current operational baseline is understood

The area should remain:
- read-oriented
- snapshot-first
- explicit about business semantics
