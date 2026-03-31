# Reorder: Dunning Retry Schedule Semantics Spec

This document covers step `2.4.7` from `documentation/implementation_plan.md`.

Goal:
- define whether retry scheduling stores concrete future dates or a policy snapshot
- define how `next_retry_at` is calculated
- define the default retry policy for MVP
- define the retry-attempt limit
- define how admin schedule overrides work
- define whether later policy changes affect only new cases or also existing active cases

This specification builds on:
- `reorder/docs/specs/dunning/domain-model.md`
- `reorder/docs/specs/dunning/data-model.md`
- `reorder/docs/specs/dunning/state-machine.md`

The direction follows Medusa patterns:
- workflow-step retry is not a replacement for domain-level recovery scheduling
- scheduler discovery should use explicit due-date fields
- policy snapshots should preserve case stability over time
- admin overrides should be explicit domain actions, not hidden side effects

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for retry schedule semantics
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. Core semantics

The `Dunning` retry schedule should use:
- a policy snapshot stored on the case
- one explicit next due timestamp stored on the case

This means:
- `retry_schedule` stores the retry policy snapshot
- `next_retry_at` stores the currently scheduled next retry date

The system should not store the full future retry calendar as a list of concrete dates in MVP.

## 2. Policy snapshot versus concrete dates

### Final decision

The schedule should store a policy snapshot, not a materialized list of all future retry dates.

Recommended shape:

```ts
type DunningRetrySchedule = {
  strategy: "fixed_intervals"
  intervals: number[]
  timezone: "UTC"
  source: "default_policy" | "manual_override"
}
```

Where:
- `intervals` are retry offsets in minutes
- each offset is interpreted relative to the previous failed attempt or initial case scheduling anchor

### Why this is preferred

This is preferred because:
- it keeps the model compact and stable
- it avoids storing redundant future dates that may never be used
- it allows the scheduler to use one explicit due field: `next_retry_at`
- it preserves the retry policy actually assigned to the case

### Rejected alternative

Rejected option:
- store a full array of future concrete retry timestamps on the case

Why it is worse:
- more redundant data
- more update churn after every attempt
- harder to reason about after manual override or policy evolution
- less aligned with the current `next_retry_at`-driven queue model

## 3. Scheduler field semantics

`next_retry_at` is the only scheduler-facing due-date field in MVP.

It answers:
- when the next retry becomes eligible for execution

It does not answer:
- the entire future retry plan
- whether the case is terminal
- whether the current policy was default or manually overridden

Those concerns belong to:
- `status`
- `retry_schedule`
- `max_attempts`

## 4. Retry anchor semantics

The calculation of `next_retry_at` should use explicit anchors.

### Initial retry scheduling

When a case is first created:
- the first retry should be scheduled relative to the case creation moment or the originating failed renewal event time

Recommended anchor for MVP:
- the case creation timestamp

This is operationally simple and stable.

### Subsequent retry scheduling

After a failed `DunningAttempt`:
- the next retry should be scheduled relative to the failed attempt’s `finished_at`

Why:
- it reflects when the system actually learned that another retry is needed
- it avoids drift based on stale planned times
- it keeps retry delay semantics intuitive for operators

## 5. How `next_retry_at` is calculated

### Final decision

`next_retry_at` should be calculated from:
- the case’s `retry_schedule.intervals`
- the current attempt number
- the appropriate scheduling anchor

Recommended formula:

- first scheduled retry:
  - `next_retry_at = case_created_at + intervals[0]`
- after failed attempt number `n`:
  - if `intervals[n]` exists, `next_retry_at = failed_attempt.finished_at + intervals[n]`
  - otherwise the case should not auto-schedule another retry

Interpretation:
- `attempt_no = 1` consumes `intervals[0]` as the delay before the first retry
- `attempt_no = 2` uses `intervals[1]` for the next retry after the second failure

The exact implementation detail of array indexing can be normalized later, but the semantic rule is:
- one interval slot corresponds to one future retry opportunity

## 6. Default retry policy

### Final decision for MVP

The default retry policy should be:

- `strategy = fixed_intervals`
- `timezone = UTC`
- `source = default_policy`
- `intervals = [1440, 4320, 10080]`

This means:
- first retry after 1 day
- second retry after 3 days
- third retry after 7 days

Why this is preferred:
- simple and easy to reason about
- long enough to avoid noisy repeated charges
- conservative for off-session payment recovery
- aligns with the product direction of operational recovery rather than aggressive billing pressure

## 7. Default max-attempt policy

### Final decision for MVP

The default limit should be:
- `max_attempts = 3`

This aligns with the default interval list.

Meaning:
- the case may execute up to three real `DunningAttempt` payment recovery attempts
- once the third attempt fails, the case should close as `unrecovered`

Why this is preferred:
- simple relationship between policy and limit
- easy for Admin to understand
- sufficient for MVP without overcomplicating retry behavior

## 8. Relationship between `intervals` and `max_attempts`

Recommended invariant:
- the default `intervals.length` should equal `max_attempts`

Why:
- each allowed retry opportunity has one explicit delay slot
- this avoids ambiguous “extra attempts without schedule” semantics

If a manual override changes one but not the other:
- the implementation should validate consistency
- later workflows should reject invalid schedule overrides

Recommended MVP rule:
- `intervals.length` must equal `max_attempts`

## 9. When auto-retry stops

Auto-retry should stop when any of the following is true:

- `attempt_count >= max_attempts`
- policy explicitly moves the case to `awaiting_manual_resolution`
- the case is already terminal
- a manual operator action closes the case

When auto-retry stops:
- `next_retry_at` must be cleared
- the case must not remain in `retry_scheduled`

## 10. Admin override semantics

Admin schedule override should mutate the schedule of one existing case explicitly.

### Final decision

An override should:
- replace the case’s current `retry_schedule`
- set `retry_schedule.source = manual_override`
- update `max_attempts` if the override changes the number of allowed attempts
- recalculate `next_retry_at` from the new schedule and current case state

This should be a workflow-backed admin mutation, not an in-place low-level edit.

## 11. What an override may change

In MVP, admin override may change:
- the interval list
- the effective retry limit through `max_attempts`
- the next scheduled retry timing

In MVP, admin override should not change:
- the originating debt-event identity
- the attempt history already recorded
- the meaning of past attempts

The override applies prospectively from the moment it is saved.

## 12. Override recalculation rules

When an admin overrides the schedule:

### If the case is in `retry_scheduled`

- recompute `next_retry_at` immediately from the new policy
- keep the case in `retry_scheduled`

### If the case is in `open`

- compute the first scheduled retry from the new policy
- transition or keep the case according to the state-machine rules

Recommended behavior:
- `open -> retry_scheduled` if the override creates a valid next retry

### If the case is in `awaiting_manual_resolution`

- override alone should not silently resume automatic retry unless the admin action explicitly intends to do so

Recommended behavior:
- changing schedule while still in `awaiting_manual_resolution` updates the policy snapshot
- a separate decision is still needed to move back to `retry_scheduled`

### If the case is terminal

- override must be blocked

## 13. Does policy change affect existing active cases?

### Final decision

Changes to the default retry policy should affect only new cases by default.

Existing cases should keep their own stored policy snapshot.

Why this is preferred:
- case behavior remains stable and auditable
- operators can understand why one case follows one schedule and a later case follows another
- changing system defaults should not silently rewrite active operational commitments

## 14. Exception: explicit migration or admin override

Existing cases may adopt a new policy only through an explicit action, such as:
- an admin override on that case
- a deliberate migration or maintenance operation

This must be explicit, not automatic.

## 15. Derived view semantics

The Admin UI may derive display labels such as:
- `Retry in 3 days`
- `Retry overdue`
- `Manual review required`

But these are view concerns.

They should be derived from:
- `status`
- `next_retry_at`
- `attempt_count`
- `max_attempts`

They must not replace the stored schedule semantics.

## 16. Why not use long-running workflow retry as the main schedule

Medusa workflow steps support retry intervals, but that should not be the primary scheduling mechanism for `DunningCase`.

Why:
- domain-level retry scheduling must remain visible and queryable in Admin
- long-running workflow retry would hide queue semantics inside workflow execution state
- case-level admin overrides would be harder to reason about
- the plugin already follows explicit queue-driven patterns in `Renewals`

Recommended approach:
- use domain-level `retry_schedule` + `next_retry_at`
- let the scheduler job pick eligible cases
- keep workflow-step retry only for short-lived transient execution resilience inside one recovery attempt

## 17. Suggested lifecycle examples

### 17.1 New case with default policy

- case created
- `retry_schedule` stored with default policy snapshot
- `max_attempts = 3`
- `next_retry_at = created_at + 1 day`
- case becomes `retry_scheduled`

### 17.2 Failed first retry

- first retry attempt fails
- `attempt_count = 1`
- next interval is `3 days`
- `next_retry_at = failed_attempt.finished_at + 3 days`
- case remains `retry_scheduled`

### 17.3 Failed final retry

- third retry attempt fails
- `attempt_count = 3`
- limit reached
- no next retry is computed
- case becomes `unrecovered`

### 17.4 Manual override on active scheduled case

- case is `retry_scheduled`
- admin overrides schedule to `[2880, 10080]`
- `retry_schedule.source = manual_override`
- `max_attempts = 2`
- `next_retry_at` is recalculated from current case state

## 18. Final recommendation

For step `2.4.7`, the final recommendation is:

- store a policy snapshot in `retry_schedule`
- store only one concrete due date in `next_retry_at`
- default policy:
  - fixed intervals in UTC
  - `[1 day, 3 days, 7 days]`
- default limit:
  - `max_attempts = 3`
- admin override:
  - explicit per-case mutation
  - prospective only
  - blocked for terminal cases
- policy changes:
  - affect new cases only by default
  - existing cases keep their stored snapshot unless explicitly overridden
