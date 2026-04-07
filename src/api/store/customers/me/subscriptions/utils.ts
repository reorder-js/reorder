import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CancellationCaseStatus } from "../../../../../modules/cancellation/types"

const ACTIVE_CANCELLATION_STATUSES = [
  CancellationCaseStatus.REQUESTED,
  CancellationCaseStatus.EVALUATING_RETENTION,
  CancellationCaseStatus.RETENTION_OFFERED,
] as const

type SubscriptionStoreListItem = {
  id: string
  reference: string
  status: string
  next_renewal_at: string | null
  product_snapshot?: {
    product_title?: string | null
    variant_title?: string | null
  } | null
}

type ActiveCancellationRecord = {
  id: string
  subscription_id: string
  status: string
}

function toIsoStringOrNull(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function requireStoreCustomer(
  req: AuthenticatedMedusaRequest
) {
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication is required."
    )
  }

  return customerId
}

export async function listStoreCustomerSubscriptions(
  req: AuthenticatedMedusaRequest
) {
  const customerId = await requireStoreCustomer(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "subscription",
    fields: [
      "id",
      "reference",
      "status",
      "customer_id",
      "next_renewal_at",
      "product_snapshot",
    ],
    filters: {
      customer_id: customerId,
    },
  })

  const subscriptions = (data as SubscriptionStoreListItem[]) ?? []

  if (!subscriptions.length) {
    return {
      subscriptions: [],
    }
  }

  const { data: cancellationData } = await query.graph({
    entity: "cancellation_case",
    fields: ["id", "subscription_id", "status"],
    filters: {
      subscription_id: subscriptions.map((subscription) => subscription.id),
      status: [...ACTIVE_CANCELLATION_STATUSES],
    },
  })

  const activeCases = new Map<string, ActiveCancellationRecord>()

  for (const record of (cancellationData as ActiveCancellationRecord[]) ?? []) {
    if (!activeCases.has(record.subscription_id)) {
      activeCases.set(record.subscription_id, record)
    }
  }

  return {
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      reference: subscription.reference,
      status: subscription.status,
      product_title: subscription.product_snapshot?.product_title ?? null,
      variant_title: subscription.product_snapshot?.variant_title ?? null,
      next_renewal_at: toIsoStringOrNull(subscription.next_renewal_at),
      active_cancellation_case: activeCases.get(subscription.id)
        ? {
            id: activeCases.get(subscription.id)!.id,
            status: activeCases.get(subscription.id)!.status,
          }
        : null,
    })),
  }
}

export async function retrieveOwnedSubscription(
  req: AuthenticatedMedusaRequest,
  subscriptionId: string
) {
  const customerId = await requireStoreCustomer(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph(
    {
      entity: "subscription",
      fields: ["id", "customer_id"],
      filters: {
        id: [subscriptionId],
        customer_id: customerId,
      },
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  const subscription = (data as Array<{ id: string; customer_id: string }>)[0]

  if (!subscription) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Subscription '${subscriptionId}' was not found for the authenticated customer.`
    )
  }

  return subscription
}

export function sendStoreJson(res: MedusaResponse, body: unknown, status = 200) {
  return res.status(status).json(body)
}
