export enum ActivityLogAdminActorType {
  USER = "user",
  SYSTEM = "system",
  SCHEDULER = "scheduler",
}

export type ActivityLogAdminSubscriptionSummary = {
  subscription_id: string
  reference: string
  customer_id: string | null
  customer_name: string
  product_title: string
  variant_title: string
}

export type ActivityLogAdminListItem = {
  id: string
  subscription_id: string
  event_type: string
  actor_type: ActivityLogAdminActorType
  actor_id: string | null
  subscription: ActivityLogAdminSubscriptionSummary
  reason: string | null
  change_summary: string | null
  created_at: string
}

export type ActivityLogAdminDetail = ActivityLogAdminListItem & {
  previous_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
  changed_fields: Array<{
    field: string
    before: unknown
    after: unknown
  }>
  metadata: Record<string, unknown> | null
}

export type ActivityLogAdminListResponse = {
  subscription_logs: ActivityLogAdminListItem[]
  count: number
  limit: number
  offset: number
}

export type ActivityLogAdminDetailResponse = {
  subscription_log: ActivityLogAdminDetail
}
