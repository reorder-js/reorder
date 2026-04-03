import type { SubscriptionSettingsShape } from "./normalize-settings"

type SettingsAuditMetadataInput = {
  previous: SubscriptionSettingsShape
  updated_by?: string | null
  reason?: string | null
  changed_at: string
}

export function appendSettingsAuditMetadata(
  metadata: Record<string, unknown> | null,
  input: SettingsAuditMetadataInput
) {
  const existing = Array.isArray(metadata?.audit_log)
    ? [...(metadata.audit_log as Record<string, unknown>[])]
    : []

  existing.push({
    action: "update_settings",
    who: input.updated_by ?? null,
    when: input.changed_at,
    reason: input.reason ?? null,
    previous_version: input.previous.version,
  })

  return {
    ...(metadata ?? {}),
    audit_log: existing,
    last_update: existing[existing.length - 1],
  }
}
