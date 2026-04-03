# Admin Subscription Settings API

This document describes the current Admin API contract for the `Subscription Settings` area of the `Reorder` plugin.

It is intended to be the current source of truth for:
- request and response shapes
- fallback versus persisted semantics
- optimistic locking behavior
- validation and error mapping

All routes described here are custom Admin routes exposed by the plugin and intended for authenticated Medusa Admin users.

## Base Path

All routes are under:

`/admin/subscription-settings`

## Authentication

The current implementation uses authenticated Admin routes.

In implementation terms:
- the routes use `AuthenticatedMedusaRequest`
- request validation is handled through Medusa middleware and Zod schemas
- route handlers remain thin and delegate to the settings service or update workflow

The current MVP does not yet add a dedicated role-based permission layer beyond authenticated Admin access.

## Shared DTO Shape

The current API returns a single top-level object:

```json
{
  "subscription_settings": {
    "settings_key": "global",
    "default_trial_days": 0,
    "dunning_retry_intervals": [1440, 4320, 10080],
    "max_dunning_attempts": 3,
    "default_renewal_behavior": "process_immediately",
    "default_cancellation_behavior": "recommend_retention_first",
    "version": 0,
    "updated_by": null,
    "updated_at": null,
    "metadata": null,
    "is_persisted": false
  }
}
```

## Shared Field Semantics

- `settings_key`
  Always `global` in MVP.
- `default_trial_days`
  Integer number of trial days.
- `dunning_retry_intervals`
  Retry schedule expressed in minutes.
- `max_dunning_attempts`
  Maximum number of retry attempts for newly created dunning flows.
- `default_renewal_behavior`
  Global default renewal policy for create-time renewal decisions.
- `default_cancellation_behavior`
  Global default cancellation policy for create-time cancellation decisions.
- `version`
  Monotonic version used for optimistic locking.
- `updated_by`
  Actor id of the last successful persisted update, or `null` when no persisted record exists.
- `updated_at`
  Timestamp of the last successful persisted update, or `null` when no persisted record exists.
- `metadata`
  Technical metadata including `audit_log` and `last_update`.
- `is_persisted`
  `false` when the response is built from fallback defaults, `true` when it comes from the stored singleton.

## 1. Get Effective Settings

### Endpoint

- Method: `GET`
- Path: `/admin/subscription-settings`

### Purpose

Returns the effective settings payload used by the Admin Settings page and runtime consumers.

### Success Response

Status:
- `200 OK`

Behavior:
- returns fallback defaults when no persisted singleton exists
- never returns `404` just because the settings record has not been created yet

### Fallback Response Example

```json
{
  "subscription_settings": {
    "settings_key": "global",
    "default_trial_days": 0,
    "dunning_retry_intervals": [1440, 4320, 10080],
    "max_dunning_attempts": 3,
    "default_renewal_behavior": "process_immediately",
    "default_cancellation_behavior": "recommend_retention_first",
    "version": 0,
    "updated_by": null,
    "updated_at": null,
    "metadata": null,
    "is_persisted": false
  }
}
```

### Persisted Response Example

```json
{
  "subscription_settings": {
    "settings_key": "global",
    "default_trial_days": 21,
    "dunning_retry_intervals": [45, 180, 720],
    "max_dunning_attempts": 3,
    "default_renewal_behavior": "require_review_for_pending_changes",
    "default_cancellation_behavior": "allow_direct_cancellation",
    "version": 1,
    "updated_by": "user_01ABC",
    "updated_at": "2026-04-03T14:00:00.000Z",
    "metadata": {
      "audit_log": [],
      "last_update": null
    },
    "is_persisted": true
  }
}
```

## 2. Update Settings

### Endpoint

- Method: `POST`
- Path: `/admin/subscription-settings`

### Purpose

Persists a new or updated singleton settings record through the dedicated workflow.

### Request Body

Supported fields:
- `default_trial_days?: number`
- `dunning_retry_intervals?: number[]`
- `max_dunning_attempts?: number`
- `default_renewal_behavior?: "process_immediately" | "require_review_for_pending_changes"`
- `default_cancellation_behavior?: "recommend_retention_first" | "allow_direct_cancellation"`
- `expected_version?: number`
- `reason?: string | null`

Notes:
- `expected_version` is used for optimistic locking.
- omitted settings fields keep their current effective value.
- `updated_by` is derived from the authenticated Admin actor.

### Create-on-First-Write Semantics

The first successful `POST` creates the singleton record.

Current expectation:
- first persisted update should use `expected_version = 0`

### Success Response

Status:
- `200 OK`

Shape:

```json
{
  "subscription_settings": {
    "settings_key": "global",
    "default_trial_days": 21,
    "dunning_retry_intervals": [45, 180, 720],
    "max_dunning_attempts": 3,
    "default_renewal_behavior": "require_review_for_pending_changes",
    "default_cancellation_behavior": "allow_direct_cancellation",
    "version": 1,
    "updated_by": "user_01ABC",
    "updated_at": "2026-04-03T14:00:00.000Z",
    "metadata": {
      "audit_log": [
        {
          "action": "update_settings",
          "who": "user_01ABC",
          "when": "2026-04-03T14:00:00.000Z",
          "reason": "admin_save",
          "previous_version": 0,
          "next_version": 1,
          "change_summary": [
            {
              "field": "default_trial_days",
              "from": 0,
              "to": 21
            }
          ]
        }
      ],
      "last_update": {
        "action": "update_settings",
        "who": "user_01ABC",
        "when": "2026-04-03T14:00:00.000Z",
        "reason": "admin_save",
        "previous_version": 0,
        "next_version": 1,
        "change_summary": [
          {
            "field": "default_trial_days",
            "from": 0,
            "to": 21
          }
        ]
      }
    },
    "is_persisted": true
  }
}
```

## Validation Rules

Current request validation rules:
- `default_trial_days >= 0`
- `max_dunning_attempts > 0`
- `expected_version >= 0`
- `dunning_retry_intervals` must contain positive integers only
- `dunning_retry_intervals` must be strictly increasing without duplicates
- `max_dunning_attempts` must match the number of retry intervals
- behavior fields must match the supported enum values

Validation is enforced at two layers:
- Zod on the API boundary
- domain validation in the settings module and workflow

## Error Semantics

### `400 invalid_data`

Returned for:
- invalid scalar ranges
- invalid enum values
- invalid retry interval lists
- inconsistent retry schedule versus `max_dunning_attempts`

### `409 conflict`

Returned for:
- stale `expected_version`
- optimistic locking mismatch between the submitted request and the current persisted settings version

### `500 unexpected_state`

Returned for:
- unexpected workflow or persistence failures

## Current MVP Boundaries

The current API intentionally does not include:
- `POST /admin/subscription-settings/reset`
- separate history endpoints
- dedicated changelog browsing endpoints
- role-based route restrictions beyond authenticated Admin access
