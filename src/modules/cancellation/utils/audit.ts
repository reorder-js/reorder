type CancellationManualActionName =
  | "start_case"
  | "update_reason"
  | "smart_cancel"
  | "apply_offer"
  | "finalize_cancellation"

type AppendCancellationManualActionInput = {
  action: CancellationManualActionName
  who?: string | null
  when: string
  why?: string | null
  data?: Record<string, unknown> | null
}

export function appendCancellationManualAction(
  metadata: Record<string, unknown> | null,
  input: AppendCancellationManualActionInput
) {
  const existing = Array.isArray(metadata?.manual_actions)
    ? [...(metadata?.manual_actions as Record<string, unknown>[])]
    : []

  existing.push({
    action: input.action,
    who: input.who ?? null,
    when: input.when,
    why: input.why ?? null,
    ...(input.data ?? {}),
  })

  return {
    ...(metadata ?? {}),
    manual_actions: existing,
    last_manual_action: existing[existing.length - 1],
  }
}
