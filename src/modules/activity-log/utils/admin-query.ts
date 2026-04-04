import type { MedusaContainer } from "@medusajs/framework/types"
import { ACTIVITY_LOG_MODULE } from ".."
import type ActivityLogModuleService from "../service"
import {
  ActivityLogActorType,
  type ActivityLogChangedField,
} from "../types"
import {
  ActivityLogAdminActorType,
  type ActivityLogAdminActorSummary,
  type ActivityLogAdminDetail,
  type ActivityLogAdminDetailResponse,
  type ActivityLogAdminListItem,
  type ActivityLogAdminListResponse,
  type ActivityLogAdminSubscriptionSummary,
} from "../../../admin/types/activity-log"

export type ListAdminSubscriptionLogsInput = {
  limit?: number
  offset?: number
  order?: string
  direction?: "asc" | "desc"
  q?: string
  subscription_id?: string
  customer_id?: string
  event_type?: string[]
  actor_type?: string[]
  date_from?: string
  date_to?: string
}

type SubscriptionLogRecord = {
  id: string
  subscription_id: string
  customer_id: string | null
  event_type: string
  actor_type: ActivityLogActorType
  actor_id: string | null
  subscription_reference: string
  customer_name: string | null
  product_title: string | null
  variant_title: string | null
  reason: string | null
  previous_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
  changed_fields: ActivityLogChangedField[] | null
  metadata: Record<string, unknown> | null
  created_at: Date | string
  updated_at: Date | string
}

type QueryGraph = {
  graph: (input: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: Array<Record<string, unknown>> }>
}

type AdminUserRecord = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
}

const databaseSortableFields = new Set([
  "created_at",
  "event_type",
  "actor_type",
])

const inMemorySortableFields = new Set([
  "subscription_reference",
  "customer_name",
  "reason",
])

function getActivityLogModule(container: MedusaContainer) {
  return container.resolve(ACTIVITY_LOG_MODULE) as ActivityLogModuleService
}

function getQuery(container: MedusaContainer) {
  return container.resolve("query") as QueryGraph
}

function assertSortableField(order?: string) {
  if (!order) {
    return
  }

  if (
    !databaseSortableFields.has(order) &&
    !inMemorySortableFields.has(order)
  ) {
    throw new Error(`Unsupported sort field '${order}'`)
  }
}

function buildFilters(input: ListAdminSubscriptionLogsInput) {
  const filters: Record<string, unknown> = {}

  if (input.subscription_id) {
    filters.subscription_id = input.subscription_id
  }

  if (input.customer_id) {
    filters.customer_id = input.customer_id
  }

  if (input.event_type?.length) {
    filters.event_type = input.event_type
  }

  if (input.actor_type?.length) {
    filters.actor_type = input.actor_type
  }

  if (input.date_from || input.date_to) {
    filters.created_at = {
      ...(input.date_from ? { $gte: input.date_from } : {}),
      ...(input.date_to ? { $lte: input.date_to } : {}),
    }
  }

  return filters
}

function mapActorType(actorType: ActivityLogActorType) {
  switch (actorType) {
    case ActivityLogActorType.USER:
      return ActivityLogAdminActorType.USER
    case ActivityLogActorType.SYSTEM:
      return ActivityLogAdminActorType.SYSTEM
    case ActivityLogActorType.SCHEDULER:
      return ActivityLogAdminActorType.SCHEDULER
  }
}

function mapSubscriptionSummary(
  record: SubscriptionLogRecord
): ActivityLogAdminSubscriptionSummary {
  return {
    subscription_id: record.subscription_id,
    reference: record.subscription_reference,
    customer_id: record.customer_id,
    customer_name: record.customer_name ?? "Unknown customer",
    product_title: record.product_title ?? "Unknown product",
    variant_title: record.variant_title ?? "Unknown variant",
  }
}

function buildActorName(user?: AdminUserRecord | null) {
  if (!user) {
    return null
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()

  return name || null
}

function mapActorSummary(
  record: SubscriptionLogRecord,
  user?: AdminUserRecord | null
): ActivityLogAdminActorSummary {
  const name = buildActorName(user)
  const email = user?.email ?? null

  return {
    type: mapActorType(record.actor_type),
    id: record.actor_id,
    email,
    name,
    display: email ?? name ?? record.actor_id,
  }
}

function buildChangeSummary(record: SubscriptionLogRecord) {
  if (record.changed_fields?.length) {
    return record.changed_fields
      .slice(0, 3)
      .map((field) => field.field)
      .join(", ")
  }

  if (record.reason) {
    return record.reason
  }

  if (record.new_state) {
    return Object.keys(record.new_state).slice(0, 3).join(", ") || null
  }

  return null
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return ""
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return value
}

async function resolveAdminUsersById(
  container: MedusaContainer,
  records: SubscriptionLogRecord[]
) {
  const actorIds = [...new Set(
    records
      .filter(
        (record) =>
          record.actor_type === ActivityLogActorType.USER && Boolean(record.actor_id)
      )
      .map((record) => record.actor_id as string)
  )]

  if (!actorIds.length) {
    return new Map<string, AdminUserRecord>()
  }

  try {
    const query = getQuery(container)
    const { data } = await query.graph({
      entity: "user",
      fields: ["id", "email", "first_name", "last_name"],
      filters: {
        id: actorIds,
      },
    })

    return new Map(
      data.map((user) => [
        String(user.id),
        {
          id: String(user.id),
          email:
            typeof user.email === "string" && user.email.length ? user.email : null,
          first_name:
            typeof user.first_name === "string" && user.first_name.length
              ? user.first_name
              : null,
          last_name:
            typeof user.last_name === "string" && user.last_name.length
              ? user.last_name
              : null,
        },
      ])
    )
  } catch {
    return new Map<string, AdminUserRecord>()
  }
}

function mapListItem(
  record: SubscriptionLogRecord,
  usersById: Map<string, AdminUserRecord>
): ActivityLogAdminListItem {
  const user =
    record.actor_type === ActivityLogActorType.USER && record.actor_id
      ? usersById.get(record.actor_id) ?? null
      : null

  return {
    id: record.id,
    subscription_id: record.subscription_id,
    event_type: record.event_type,
    actor_type: mapActorType(record.actor_type),
    actor_id: record.actor_id,
    actor: mapActorSummary(record, user),
    subscription: mapSubscriptionSummary(record),
    reason: record.reason,
    change_summary: buildChangeSummary(record),
    created_at: toIsoString(record.created_at),
  }
}

function mapDetail(
  record: SubscriptionLogRecord,
  usersById: Map<string, AdminUserRecord>
): ActivityLogAdminDetail {
  return {
    ...mapListItem(record, usersById),
    previous_state: record.previous_state,
    new_state: record.new_state,
    changed_fields: record.changed_fields ?? [],
    metadata: record.metadata,
  }
}

function matchesQuery(record: SubscriptionLogRecord, q?: string) {
  if (!q?.trim()) {
    return true
  }

  const normalized = q.trim().toLowerCase()

  return [
    record.subscription_reference,
    record.customer_name ?? "",
    record.reason ?? "",
  ].some((value) => value.toLowerCase().includes(normalized))
}

function getSortableValue(record: ActivityLogAdminListItem, order: string) {
  switch (order) {
    case "created_at":
      return record.created_at ?? ""
    case "event_type":
      return record.event_type ?? ""
    case "actor_type":
      return record.actor_type ?? ""
    case "subscription_reference":
      return record.subscription.reference ?? ""
    case "customer_name":
      return record.subscription.customer_name ?? ""
    case "reason":
      return record.reason ?? ""
    default:
      return ""
  }
}

function sortItems(
  items: ActivityLogAdminListItem[],
  order: string,
  direction: "asc" | "desc"
) {
  const multiplier = direction === "asc" ? 1 : -1

  return [...items].sort((left, right) => {
    const leftValue = getSortableValue(left, order)
    const rightValue = getSortableValue(right, order)

    if (leftValue < rightValue) {
      return -1 * multiplier
    }

    if (leftValue > rightValue) {
      return 1 * multiplier
    }

    return 0
  })
}

export async function listAdminSubscriptionLogs(
  container: MedusaContainer,
  input: ListAdminSubscriptionLogsInput
): Promise<ActivityLogAdminListResponse> {
  const activityLogModule = getActivityLogModule(container)
  const order = input.order ?? "created_at"
  const direction = input.direction ?? "desc"

  assertSortableField(order)

  const [records] = (await activityLogModule.listAndCountSubscriptionLogs(
    buildFilters(input) as any,
    {
      order: {
        [databaseSortableFields.has(order) ? order : "created_at"]:
          databaseSortableFields.has(order) ? direction : "desc",
      },
    } as any
  )) as unknown as [SubscriptionLogRecord[], number]

  const filtered = records.filter((record) => matchesQuery(record, input.q))
  const usersById = await resolveAdminUsersById(container, filtered)
  const mapped = filtered.map((record) => mapListItem(record, usersById))
  const sorted = inMemorySortableFields.has(order)
    ? sortItems(mapped, order, direction)
    : mapped
  const offset = input.offset ?? 0
  const limit = input.limit ?? 20
  const paginated = sorted.slice(offset, offset + limit)

  return {
    subscription_logs: paginated,
    count: sorted.length,
    limit,
    offset,
  }
}

export async function getAdminSubscriptionLogDetail(
  container: MedusaContainer,
  id: string
): Promise<ActivityLogAdminDetailResponse> {
  const activityLogModule = getActivityLogModule(container)
  const record = (await activityLogModule.retrieveSubscriptionLog(
    id
  )) as unknown as SubscriptionLogRecord
  const usersById = await resolveAdminUsersById(container, [record])

  return {
    subscription_log: mapDetail(record, usersById),
  }
}

export async function getAdminSubscriptionTimeline(
  container: MedusaContainer,
  subscriptionId: string,
  input: Omit<ListAdminSubscriptionLogsInput, "subscription_id">
): Promise<ActivityLogAdminListResponse> {
  return await listAdminSubscriptionLogs(container, {
    ...input,
    subscription_id: subscriptionId,
  })
}
