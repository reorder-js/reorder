import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CancellationCaseStatus } from "../../../../../modules/cancellation/types"
import { DunningCaseStatus } from "../../../../../modules/dunning/types"
import { SubscriptionStatus } from "../../../../../modules/subscription/types"

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

type SubscriptionStoreDetailRecord = SubscriptionStoreListItem & {
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  last_renewal_at?: string | Date | null
  payment_context?: {
    payment_provider_id?: string | null
  } | null
  shipping_address?: Record<string, unknown> | null
}

type DunningCaseRecord = {
  id: string
  subscription_id: string
  status: string
  attempt_count: number
  max_attempts: number
  next_retry_at: string | Date | null
  last_payment_error_code: string | null
  last_payment_error_message: string | null
}

type DunningAttemptRecord = {
  id: string
  dunning_case_id: string
  attempt_no: number
  status: string
  error_code: string | null
  error_message: string | null
  finished_at: string | Date | null
}

type ProductRecord = {
  id: string
  title: string
  variants?: Array<{
    id: string
    title: string
  }>
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

export async function retrieveOwnedSubscriptionDetail(
  req: AuthenticatedMedusaRequest,
  subscriptionId: string
) {
  const customerId = await requireStoreCustomer(req)
  return await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: subscriptionId,
  })
}

function mapPaymentStatus(
  subscriptionStatus: string,
  dunningCase: DunningCaseRecord | null
) {
  if (
    subscriptionStatus === SubscriptionStatus.PAST_DUE ||
    dunningCase?.status === DunningCaseStatus.OPEN ||
    dunningCase?.status === DunningCaseStatus.RETRY_SCHEDULED ||
    dunningCase?.status === DunningCaseStatus.RETRYING ||
    dunningCase?.status === DunningCaseStatus.AWAITING_MANUAL_RESOLUTION
  ) {
    return "recovery_required"
  }

  return "ok"
}

function mapPaymentRecovery(
  dunningCase: DunningCaseRecord | null,
  latestAttempt: DunningAttemptRecord | null
) {
  if (!dunningCase) {
    return null
  }

  const retryEligible =
    dunningCase.status === DunningCaseStatus.OPEN ||
    dunningCase.status === DunningCaseStatus.RETRY_SCHEDULED ||
    dunningCase.status === DunningCaseStatus.AWAITING_MANUAL_RESOLUTION

  return {
    dunning_case_id: dunningCase.id,
    state: dunningCase.status,
    retry_eligible: retryEligible,
    attempt_count: dunningCase.attempt_count,
    max_attempts: dunningCase.max_attempts,
    next_retry_at: toIsoStringOrNull(dunningCase.next_retry_at),
    last_error_code:
      latestAttempt?.error_code ?? dunningCase.last_payment_error_code ?? null,
    last_error_message:
      latestAttempt?.error_message ??
      dunningCase.last_payment_error_message ??
      null,
    last_attempt_status: latestAttempt?.status ?? null,
  }
}

async function getActiveCancellationCase(
  query: any,
  subscriptionId: string
) {
  const { data } = await query.graph({
    entity: "cancellation_case",
    fields: ["id", "subscription_id", "status"],
    filters: {
      subscription_id: [subscriptionId],
      status: [...ACTIVE_CANCELLATION_STATUSES],
    },
    pagination: {
      take: 1,
    },
  })

  const record = (data as ActiveCancellationRecord[])[0]

  if (!record) {
    return null
  }

  return {
    id: record.id,
    status: record.status,
  }
}

async function getSubscriptionDunningCase(
  query: any,
  subscriptionId: string
) {
  const { data } = await query.graph({
    entity: "dunning_case",
    fields: [
      "id",
      "subscription_id",
      "status",
      "attempt_count",
      "max_attempts",
      "next_retry_at",
      "last_payment_error_code",
      "last_payment_error_message",
    ],
    filters: {
      subscription_id: [subscriptionId],
      status: [
        DunningCaseStatus.OPEN,
        DunningCaseStatus.RETRY_SCHEDULED,
        DunningCaseStatus.RETRYING,
        DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
      ],
    },
  })

  const dunningCases = (data as DunningCaseRecord[]) ?? []

  return dunningCases[0] ?? null
}

async function getLatestDunningAttempt(
  query: any,
  dunningCaseId: string
) {
  const { data } = await query.graph({
    entity: "dunning_attempt",
    fields: [
      "id",
      "dunning_case_id",
      "attempt_no",
      "status",
      "error_code",
      "error_message",
      "finished_at",
    ],
    filters: {
      dunning_case_id: [dunningCaseId],
    },
  })

  const attempts = (data as DunningAttemptRecord[]) ?? []
  const latest = attempts.sort((left, right) => right.attempt_no - left.attempt_no)[0]

  return latest ?? null
}

export async function getStoreSubscriptionDetailResponse(
  scope: AuthenticatedMedusaRequest["scope"],
  input: {
    customer_id: string
    subscription_id: string
  }
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph(
    {
      entity: "subscription",
      fields: [
        "id",
        "reference",
        "status",
        "customer_id",
        "frequency_interval",
        "frequency_value",
        "next_renewal_at",
        "last_renewal_at",
        "product_snapshot",
        "shipping_address",
        "payment_context",
      ],
      filters: {
        id: [input.subscription_id],
        customer_id: input.customer_id,
      },
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  const subscription = (data as SubscriptionStoreDetailRecord[])[0]

  if (!subscription) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Subscription '${input.subscription_id}' was not found for the authenticated customer.`
    )
  }

  const activeCancellationCase = await getActiveCancellationCase(
    query,
    subscription.id
  )
  const dunningCase = await getSubscriptionDunningCase(query, subscription.id)
  const latestDunningAttempt = dunningCase
    ? await getLatestDunningAttempt(query, dunningCase.id)
    : null

  return {
    subscription: {
      id: subscription.id,
      reference: subscription.reference,
      status: subscription.status,
      product_title: subscription.product_snapshot?.product_title ?? null,
      variant_title: subscription.product_snapshot?.variant_title ?? null,
      frequency_interval: subscription.frequency_interval,
      frequency_value: subscription.frequency_value,
      next_renewal_at: toIsoStringOrNull(subscription.next_renewal_at),
      last_renewal_at: toIsoStringOrNull(subscription.last_renewal_at),
      shipping_address: subscription.shipping_address ?? null,
      payment_status: mapPaymentStatus(subscription.status, dunningCase),
      payment_provider_id:
        subscription.payment_context?.payment_provider_id ?? null,
      payment_recovery: mapPaymentRecovery(dunningCase, latestDunningAttempt),
      active_cancellation_case: activeCancellationCase,
    },
  }
}

export async function getOwnedSubscriptionForAction(
  req: AuthenticatedMedusaRequest,
  subscriptionId: string
) {
  const customerId = await requireStoreCustomer(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph(
    {
      entity: "subscription",
      fields: [
        "id",
        "customer_id",
        "variant_id",
        "status",
      ],
      filters: {
        id: [subscriptionId],
        customer_id: customerId,
      },
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  const subscription = (data as Array<{
    id: string
    customer_id: string
    variant_id: string
    status: string
  }>)[0]

  if (!subscription) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Subscription '${subscriptionId}' was not found for the authenticated customer.`
    )
  }

  return subscription
}

export async function getRetryableDunningCaseForSubscription(
  req: AuthenticatedMedusaRequest,
  subscriptionId: string
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const dunningCase = await getSubscriptionDunningCase(query, subscriptionId)

  if (!dunningCase) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `Subscription '${subscriptionId}' doesn't have an active payment recovery case.`
    )
  }

  if (
    dunningCase.status === DunningCaseStatus.RETRYING ||
    dunningCase.status === DunningCaseStatus.RECOVERED ||
    dunningCase.status === DunningCaseStatus.UNRECOVERED
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `Subscription '${subscriptionId}' is not eligible for payment retry.`
    )
  }

  return dunningCase
}

export async function getStoreProductSubscriptionOfferResponse(
  req: MedusaRequest<unknown, { variant_id?: string } | undefined>
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id
  const variantId = req.validatedQuery?.variant_id ?? null

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.title"],
    filters: {
      id: [productId],
    },
  })

  const product = (data as ProductRecord[])[0]

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product '${productId}' was not found.`
    )
  }

  if (variantId && !product.variants?.some((variant) => variant.id === variantId)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Variant '${variantId}' does not belong to product '${productId}'.`
    )
  }

  const { resolveProductSubscriptionConfig } = await import(
    "../../../../../modules/plan-offer/utils/effective-config.js"
  )

  const config = await resolveProductSubscriptionConfig(req.scope, {
    product_id: productId,
    variant_id: variantId,
  })

  return {
    subscription_offer: {
      is_subscription_available: config.is_enabled,
      product_id: productId,
      variant_id: variantId,
      source_offer_id: config.source_offer_id,
      source_scope: config.source_scope,
      allowed_frequencies: config.allowed_frequencies.map((frequency) => {
        const matchingDiscount = config.discount_per_frequency.find(
          (discount) =>
            String(discount.interval) === String(frequency.interval) &&
            discount.value === frequency.value
        )

        return {
          frequency_interval: String(frequency.interval),
          frequency_value: frequency.value,
          label:
            frequency.value === 1
              ? `Every ${frequency.interval}`
              : `Every ${frequency.value} ${frequency.interval}s`,
          discount: matchingDiscount
            ? {
                type: matchingDiscount.discount_type,
                value: matchingDiscount.discount_value,
              }
            : null,
        }
      }),
      discount_semantics: {
        has_frequency_specific_discounts: config.discount_per_frequency.length > 0,
      },
      minimum_cycles: config.rules?.minimum_cycles ?? null,
      trial: config.rules
        ? {
            is_enabled: config.rules.trial_enabled,
            days: config.rules.trial_days ?? null,
          }
        : null,
    },
  }
}

export function sendStoreJson(res: MedusaResponse, body: unknown, status = 200) {
  return res.status(status).json(body)
}
