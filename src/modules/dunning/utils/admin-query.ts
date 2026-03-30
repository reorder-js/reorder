import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  DunningAttemptAdminStatus,
  DunningCaseAdminDetail,
  DunningCaseAdminDetailResponse,
  DunningCaseAdminStatus,
} from "../../../admin/types/dunning"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../types"
import { dunningErrors } from "./errors"

type DunningCaseRecord = {
  id: string
  subscription_id: string
  renewal_cycle_id: string
  renewal_order_id: string | null
  status: DunningCaseStatus
  attempt_count: number
  max_attempts: number
  retry_schedule: DunningRetrySchedule | null
  next_retry_at: string | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
  last_attempt_at: string | null
  recovered_at: string | null
  closed_at: string | null
  recovery_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type DunningAttemptRecord = {
  id: string
  dunning_case_id: string
  attempt_no: number
  started_at: string
  finished_at: string | null
  status: DunningAttemptStatus
  error_code: string | null
  error_message: string | null
  payment_reference: string | null
  metadata: Record<string, unknown> | null
}

type SubscriptionRecord = {
  id: string
  reference: string
  status: "active" | "paused" | "cancelled" | "past_due"
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string
    variant_title?: string
    sku?: string | null
  } | null
}

type RenewalCycleRecord = {
  id: string
  status: "scheduled" | "processing" | "succeeded" | "failed"
  scheduled_for: string
  generated_order_id: string | null
}

type OrderRecord = {
  id: string
  display_id: number | string
  status: string
}

function mapCaseStatus(status: DunningCaseRecord["status"]) {
  switch (status) {
    case DunningCaseStatus.OPEN:
      return DunningCaseAdminStatus.OPEN
    case DunningCaseStatus.RETRY_SCHEDULED:
      return DunningCaseAdminStatus.RETRY_SCHEDULED
    case DunningCaseStatus.RETRYING:
      return DunningCaseAdminStatus.RETRYING
    case DunningCaseStatus.AWAITING_MANUAL_RESOLUTION:
      return DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION
    case DunningCaseStatus.RECOVERED:
      return DunningCaseAdminStatus.RECOVERED
    case DunningCaseStatus.UNRECOVERED:
      return DunningCaseAdminStatus.UNRECOVERED
  }

  throw dunningErrors.invalidData(`Unsupported dunning case status '${status}'`)
}

function mapAttemptStatus(status: DunningAttemptRecord["status"]) {
  switch (status) {
    case DunningAttemptStatus.PROCESSING:
      return DunningAttemptAdminStatus.PROCESSING
    case DunningAttemptStatus.SUCCEEDED:
      return DunningAttemptAdminStatus.SUCCEEDED
    case DunningAttemptStatus.FAILED:
      return DunningAttemptAdminStatus.FAILED
  }

  throw dunningErrors.invalidData(
    `Unsupported dunning attempt status '${status}'`
  )
}

export async function getAdminDunningDetail(
  container: MedusaContainer,
  id: string
): Promise<DunningCaseAdminDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "dunning_case",
    fields: [
      "id",
      "subscription_id",
      "renewal_cycle_id",
      "renewal_order_id",
      "status",
      "attempt_count",
      "max_attempts",
      "retry_schedule",
      "next_retry_at",
      "last_payment_error_code",
      "last_payment_error_message",
      "last_attempt_at",
      "recovered_at",
      "closed_at",
      "recovery_reason",
      "metadata",
      "created_at",
      "updated_at",
    ],
    filters: {
      id: [id],
    },
  })

  const dunningCase = (data as DunningCaseRecord[])[0]

  if (!dunningCase) {
    throw dunningErrors.notFound("DunningCase", id)
  }

  const [{ data: attemptsData }, { data: subscriptionsData }, { data: renewalsData }] =
    await Promise.all([
      query.graph({
        entity: "dunning_attempt",
        fields: [
          "id",
          "dunning_case_id",
          "attempt_no",
          "started_at",
          "finished_at",
          "status",
          "error_code",
          "error_message",
          "payment_reference",
          "metadata",
        ],
        filters: {
          dunning_case_id: [dunningCase.id],
        },
      }),
      query.graph({
        entity: "subscription",
        fields: [
          "id",
          "reference",
          "status",
          "customer_snapshot",
          "product_snapshot",
        ],
        filters: {
          id: [dunningCase.subscription_id],
        },
      }),
      query.graph({
        entity: "renewal_cycle",
        fields: [
          "id",
          "status",
          "scheduled_for",
          "generated_order_id",
        ],
        filters: {
          id: [dunningCase.renewal_cycle_id],
        },
      }),
    ])

  const attempts = (attemptsData as DunningAttemptRecord[]).sort(
    (left, right) => left.attempt_no - right.attempt_no
  )
  const subscription = (subscriptionsData as SubscriptionRecord[])[0]
  const renewal = (renewalsData as RenewalCycleRecord[])[0] ?? null

  if (!subscription) {
    throw dunningErrors.notFound("Subscription", dunningCase.subscription_id)
  }

  let order: OrderRecord | null = null

  if (dunningCase.renewal_order_id) {
    const { data: ordersData } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status"],
      filters: {
        id: [dunningCase.renewal_order_id],
      },
    })

    order = (ordersData as OrderRecord[])[0] ?? null
  }

  const detail: DunningCaseAdminDetail = {
    id: dunningCase.id,
    status: mapCaseStatus(dunningCase.status),
    subscription: {
      subscription_id: subscription.id,
      reference: subscription.reference,
      status: subscription.status,
      customer_name: subscription.customer_snapshot?.full_name ?? "Unknown customer",
      product_title:
        subscription.product_snapshot?.product_title ?? "Unknown product",
      variant_title:
        subscription.product_snapshot?.variant_title ?? "Unknown variant",
      sku: subscription.product_snapshot?.sku ?? null,
    },
    renewal: renewal
      ? {
          renewal_cycle_id: renewal.id,
          status: renewal.status,
          scheduled_for: renewal.scheduled_for,
          generated_order_id: renewal.generated_order_id,
        }
      : null,
    order: order
      ? {
          order_id: order.id,
          display_id: order.display_id,
          status: order.status,
        }
      : null,
    attempt_count: dunningCase.attempt_count,
    max_attempts: dunningCase.max_attempts,
    retry_schedule: dunningCase.retry_schedule,
    next_retry_at: dunningCase.next_retry_at,
    last_payment_error_code: dunningCase.last_payment_error_code,
    last_payment_error_message: dunningCase.last_payment_error_message,
    last_attempt_at: dunningCase.last_attempt_at,
    recovered_at: dunningCase.recovered_at,
    closed_at: dunningCase.closed_at,
    recovery_reason: dunningCase.recovery_reason,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      attempt_no: attempt.attempt_no,
      status: mapAttemptStatus(attempt.status),
      started_at: attempt.started_at,
      finished_at: attempt.finished_at,
      error_code: attempt.error_code,
      error_message: attempt.error_message,
      payment_reference: attempt.payment_reference,
      metadata: attempt.metadata,
    })),
    metadata: dunningCase.metadata,
    created_at: dunningCase.created_at,
    updated_at: dunningCase.updated_at,
  }

  return {
    dunning_case: detail,
  }
}
