import type { SubscriptionSettingsShape } from "./normalize-settings"

type SettingsAuditChangeSummaryEntry = {
  field: string
  from: unknown
  to: unknown
}

type SettingsAuditRecord = {
  action: "update_settings"
  who: string | null
  when: string
  reason: string | null
  previous_version: number
  next_version: number
  change_summary: SettingsAuditChangeSummaryEntry[]
}

type SettingsAuditMetadataInput = {
  previous: SubscriptionSettingsShape
  next: SubscriptionSettingsShape
  updated_by?: string | null
  reason?: string | null
  changed_at: string
}

function areValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function buildSettingsChangeSummary(
  previous: SubscriptionSettingsShape,
  next: SubscriptionSettingsShape
): SettingsAuditChangeSummaryEntry[] {
  const fields: Array<keyof SubscriptionSettingsShape> = [
    "default_trial_days",
    "dunning_retry_intervals",
    "max_dunning_attempts",
    "default_renewal_behavior",
    "default_cancellation_behavior",
  ]

  return fields
    .filter((field) => !areValuesEqual(previous[field], next[field]))
    .map((field) => ({
      field,
      from: previous[field],
      to: next[field],
    }))
}

export function appendSettingsAuditMetadata(
  metadata: Record<string, unknown> | null,
  input: SettingsAuditMetadataInput
) {
  const existing = Array.isArray(metadata?.audit_log)
    ? [...(metadata.audit_log as SettingsAuditRecord[])]
    : []
  const nextRecord: SettingsAuditRecord = {
    action: "update_settings",
    who: input.updated_by ?? null,
    when: input.changed_at,
    reason: input.reason ?? null,
    previous_version: input.previous.version,
    next_version: input.next.version,
    change_summary: buildSettingsChangeSummary(input.previous, input.next),
  }

  existing.push(nextRecord)

  return {
    ...(metadata ?? {}),
    audit_log: existing,
    last_update: nextRecord,
  }
}
