import {
  ActivityLogActorType,
  ActivityLogChangedField,
  ActivityLogEventType,
} from "../types"

type Primitive = string | number | boolean | null

type JsonLike =
  | Primitive
  | JsonLike[]
  | {
      [key: string]: JsonLike
    }

export type ActivityLogDisplaySnapshot = {
  subscription_reference: string
  customer_name?: string | null
  product_title?: string | null
  variant_title?: string | null
}

export type NormalizeLogEventInput = {
  subscription_id: string
  customer_id?: string | null
  event_type: ActivityLogEventType
  actor_type: ActivityLogActorType
  actor_id?: string | null
  display: ActivityLogDisplaySnapshot
  previous_state?: Record<string, unknown> | null
  new_state?: Record<string, unknown> | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
  correlation_id?: string | null
  dedupe: {
    scope: string
    target_id: string
    qualifier?: string | number | null
  }
}

export type NormalizedActivityLogEvent = {
  subscription_id: string
  customer_id: string | null
  event_type: ActivityLogEventType
  actor_type: ActivityLogActorType
  actor_id: string | null
  subscription_reference: string
  customer_name: string | null
  product_title: string | null
  variant_title: string | null
  reason: string | null
  dedupe_key: string
  previous_state: Record<string, JsonLike> | null
  new_state: Record<string, JsonLike> | null
  changed_fields: ActivityLogChangedField[] | null
  metadata: Record<string, JsonLike> | null
}

const SENSITIVE_KEYS = new Set([
  "address_1",
  "address_2",
  "postal_code",
  "phone",
  "payment_context",
  "payment_reference",
  "payment_method_reference",
  "customer_payment_reference",
  "source_payment_collection_id",
  "source_payment_session_id",
  "payment_session",
  "payment_sessions",
  "provider_payload",
  "provider_response",
  "raw_error",
  "stack",
  "stacktrace",
  "error_stack",
])

const ALLOWED_METADATA_KEYS = new Set([
  "renewal_cycle_id",
  "dunning_case_id",
  "cancellation_case_id",
  "retention_offer_event_id",
  "order_id",
  "trigger_type",
  "source",
  "attempt_no",
  "job_name",
  "reason_code",
  "effective_at",
  "scheduled_for",
  "status_before",
  "status_after",
  "approval_status",
])

export function normalizeActivityLogEvent(
  input: NormalizeLogEventInput
): NormalizedActivityLogEvent {
  const previousState = sanitizeStatePayload(input.previous_state ?? null)
  const newState = sanitizeStatePayload(input.new_state ?? null)
  const changedFields = buildChangedFields(previousState, newState)
  const metadata = buildMetadata(input.metadata ?? null, input.correlation_id ?? null)

  return {
    subscription_id: input.subscription_id,
    customer_id: input.customer_id ?? null,
    event_type: input.event_type,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    subscription_reference: input.display.subscription_reference,
    customer_name: input.display.customer_name ?? null,
    product_title: input.display.product_title ?? null,
    variant_title: input.display.variant_title ?? null,
    reason: input.reason ?? null,
    dedupe_key: buildActivityLogDedupeKey(
      input.event_type,
      input.dedupe.scope,
      input.dedupe.target_id,
      input.dedupe.qualifier ?? null
    ),
    previous_state: previousState,
    new_state: newState,
    changed_fields: changedFields,
    metadata,
  }
}

export function buildActivityLogDedupeKey(
  eventType: ActivityLogEventType,
  scope: string,
  targetId: string,
  qualifier?: string | number | null
) {
  const parts = [eventType, scope, targetId]

  if (qualifier !== undefined && qualifier !== null && qualifier !== "") {
    parts.push(String(qualifier))
  }

  return parts.join(":")
}

function buildMetadata(
  metadata: Record<string, unknown> | null,
  correlationId: string | null
) {
  const normalized: Record<string, JsonLike> = {}

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (!ALLOWED_METADATA_KEYS.has(key)) {
        continue
      }

      const sanitized = sanitizeValue(value)

      if (sanitized !== undefined) {
        normalized[key] = sanitized
      }
    }
  }

  if (correlationId) {
    normalized.correlation_id = correlationId
  }

  return Object.keys(normalized).length ? normalized : null
}

function sanitizeStatePayload(
  value: Record<string, unknown> | null
): Record<string, JsonLike> | null {
  if (!value) {
    return null
  }

  const normalized: Record<string, JsonLike> = {}

  for (const [key, raw] of Object.entries(value)) {
    const sanitized = sanitizeEntry(key, raw)

    if (sanitized !== undefined) {
      normalized[key] = sanitized
    }
  }

  return Object.keys(normalized).length ? normalized : null
}

function sanitizeEntry(key: string, value: unknown): JsonLike | undefined {
  if (SENSITIVE_KEYS.has(key)) {
    return undefined
  }

  return sanitizeValue(value)
}

function sanitizeValue(value: unknown): JsonLike | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => sanitizeValue(entry))
      .filter((entry): entry is JsonLike => entry !== undefined)

    return normalized
  }

  if (typeof value === "object") {
    const normalized: Record<string, JsonLike> = {}

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeEntry(key, nested)

      if (sanitized !== undefined) {
        normalized[key] = sanitized
      }
    }

    return Object.keys(normalized).length ? normalized : {}
  }

  return undefined
}

function buildChangedFields(
  previousState: Record<string, JsonLike> | null,
  newState: Record<string, JsonLike> | null
) {
  const keys = new Set([
    ...Object.keys(previousState ?? {}),
    ...Object.keys(newState ?? {}),
  ])

  const changedFields: ActivityLogChangedField[] = []

  for (const key of [...keys].sort()) {
    const before = previousState?.[key] ?? null
    const after = newState?.[key] ?? null

    if (stableStringify(before) === stableStringify(after)) {
      continue
    }

    changedFields.push({
      field: key,
      before,
      after,
    })
  }

  return changedFields.length ? changedFields : null
}

function stableStringify(value: JsonLike) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(",")}}`
}
