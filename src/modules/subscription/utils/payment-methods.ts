import type {
  IPaymentModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type {
  SubscriptionAccountHolderRecord,
  SubscriptionPaymentMethodRecord,
  SubscriptionPaymentMethodSummary,
} from "../types"
import { subscriptionErrors } from "./errors"

type CustomerAccountHolderRecord = {
  id: string
  account_holders?: SubscriptionAccountHolderRecord[] | null
}

export type ResolvedSubscriptionPaymentMethod = {
  summary: SubscriptionPaymentMethodSummary
  account_holder: SubscriptionAccountHolderRecord
}

/**
 * Normalizes a payment method returned by a payment provider into a summary that
 * is safe to expose over the Store and Admin APIs.
 *
 * Card details are read defensively because the shape of `data` is provider
 * specific: providers that do not expose card metadata simply yield null fields.
 */
export function toPaymentMethodSummary(
  method: SubscriptionPaymentMethodRecord,
  providerId: string
): SubscriptionPaymentMethodSummary {
  const data = (method.data ?? {}) as Record<string, unknown>
  const card = (data.card ?? {}) as Record<string, unknown>

  return {
    id: method.id,
    provider_id: providerId,
    type: readNullableString(data.type),
    brand: readNullableString(card.brand),
    last4: readNullableString(card.last4),
    exp_month: readNullableNumber(card.exp_month),
    exp_year: readNullableNumber(card.exp_year),
    created_at: readNullableNumber(data.created),
  }
}

/**
 * Lists the payment methods a customer has saved with the configured payment
 * providers, newest first.
 *
 * Stays provider agnostic: account holders and `listPaymentMethods` are part of
 * the Payment Module interface, so any provider implementing them is supported.
 */
export async function listCustomerPaymentMethods(
  container: MedusaContainer,
  input: {
    customer_id: string
    provider_id?: string | null
  }
): Promise<SubscriptionPaymentMethodSummary[]> {
  const accountHolders = await listCustomerAccountHolders(
    container,
    input.customer_id,
    input.provider_id ?? null
  )

  if (!accountHolders.length) {
    return []
  }

  const paymentModule = container.resolve<IPaymentModuleService>(Modules.PAYMENT)
  const summaries: SubscriptionPaymentMethodSummary[] = []

  for (const accountHolder of accountHolders) {
    const methods = (await paymentModule.listPaymentMethods({
      provider_id: accountHolder.provider_id,
      context: {
        account_holder: {
          ...accountHolder,
          data: accountHolder.data ?? {},
        },
      },
    })) as SubscriptionPaymentMethodRecord[]

    for (const method of methods ?? []) {
      if (!method?.id) {
        continue
      }

      summaries.push(toPaymentMethodSummary(method, accountHolder.provider_id))
    }
  }

  return sortPaymentMethodSummaries(summaries)
}

/**
 * Resolves a single saved payment method and guarantees it belongs to the given
 * customer, so a subscription can never be pointed at another customer's card.
 */
export async function resolveCustomerPaymentMethod(
  container: MedusaContainer,
  input: {
    customer_id: string
    provider_id: string
    payment_method_id: string
  }
): Promise<ResolvedSubscriptionPaymentMethod> {
  const accountHolders = await listCustomerAccountHolders(
    container,
    input.customer_id,
    input.provider_id
  )

  if (!accountHolders.length) {
    throw subscriptionErrors.invalidData(
      `Customer '${input.customer_id}' has no saved payment account holder for provider '${input.provider_id}'`
    )
  }

  const paymentModule = container.resolve<IPaymentModuleService>(Modules.PAYMENT)

  for (const accountHolder of accountHolders) {
    const methods = (await paymentModule.listPaymentMethods({
      provider_id: accountHolder.provider_id,
      context: {
        account_holder: {
          ...accountHolder,
          data: accountHolder.data ?? {},
        },
      },
    })) as SubscriptionPaymentMethodRecord[]

    const match = (methods ?? []).find(
      (method) => method?.id === input.payment_method_id
    )

    if (match) {
      return {
        summary: toPaymentMethodSummary(match, accountHolder.provider_id),
        account_holder: accountHolder,
      }
    }
  }

  throw subscriptionErrors.invalidData(
    `Payment method '${input.payment_method_id}' is not a saved payment method of customer '${input.customer_id}' for provider '${input.provider_id}'`
  )
}

/**
 * Resolves the most recently saved payment method of a customer for a provider.
 *
 * Used by subscription checkout when the payment session itself does not carry a
 * reusable payment method reference.
 */
export async function resolveLatestCustomerPaymentMethod(
  container: MedusaContainer,
  input: {
    customer_id: string
    provider_id: string
  }
): Promise<SubscriptionPaymentMethodSummary | null> {
  const summaries = await listCustomerPaymentMethods(container, {
    customer_id: input.customer_id,
    provider_id: input.provider_id,
  })

  return summaries[0] ?? null
}

export async function listCustomerAccountHolders(
  container: MedusaContainer,
  customerId: string,
  providerId: string | null
): Promise<SubscriptionAccountHolderRecord[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "account_holders.*"],
    filters: {
      id: [customerId],
    },
  })

  const customer = (data as CustomerAccountHolderRecord[])[0]
  const accountHolders = customer?.account_holders ?? []

  return accountHolders.filter((accountHolder) => {
    if (!accountHolder?.id || !accountHolder.provider_id) {
      return false
    }

    return providerId ? accountHolder.provider_id === providerId : true
  })
}

export function sortPaymentMethodSummaries(
  summaries: SubscriptionPaymentMethodSummary[]
): SubscriptionPaymentMethodSummary[] {
  return summaries
    .slice()
    .sort((left, right) => (right.created_at ?? 0) - (left.created_at ?? 0))
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}
