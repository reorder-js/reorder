import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { IPaymentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, PaymentEvents } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"
import type SubscriptionModuleService from "../modules/subscription/service"
import type { SubscriptionPaymentContext } from "../modules/subscription/types"

type PaymentRecord = {
  id: string
  payment_collection_id: string | null
}

type CartPaymentCollectionRecord = {
  cart_id: string | null
}

type SubscriptionRecord = {
  id: string
  customer_id: string
  payment_context: SubscriptionPaymentContext | null
}

type CustomerAccountHolderRecord = {
  account_holders?:
    | {
      id: string
      provider_id: string
      data?: Record<string, unknown> | null
    }[]
    | null
}

export default async function backfillSubscriptionPaymentMethodHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await backfillSubscriptionPaymentMethod(container, data.id)
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}

export async function backfillSubscriptionPaymentMethod(
  container: MedusaContainer,
  paymentId: string
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id"],
    filters: { id: paymentId },
  })
  const paymentCollectionId = (payments as PaymentRecord[])[0]?.payment_collection_id
  if (!paymentCollectionId) {
    return
  }

  const { data: cartLinks } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: { payment_collection_id: paymentCollectionId },
  })
  const cartId = (cartLinks as CartPaymentCollectionRecord[])[0]?.cart_id
  if (!cartId) {
    return
  }

  const { data: subscriptions } = await query.graph({
    entity: "subscription",
    fields: ["id", "customer_id", "payment_context"],
    filters: { cart_id: cartId },
  })
  const subscription = (subscriptions as SubscriptionRecord[])[0]
  if (!subscription) {
    return
  }

  const paymentContext = subscription.payment_context
  const providerId = paymentContext?.payment_provider_id
  if (!providerId) {
    return
  }

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: [
      "id",
      "account_holders.id",
      "account_holders.provider_id",
      "account_holders.data",
    ],
    filters: { id: subscription.customer_id },
  })
  const accountHolder = (customers as CustomerAccountHolderRecord[])[0]?.account_holders?.find(
    (entry) => entry.provider_id === providerId
  )
  if (!accountHolder?.id) {
    return
  }

  const paymentModule = container.resolve<IPaymentModuleService>(Modules.PAYMENT)
  const paymentMethods = await paymentModule.listPaymentMethods({
    provider_id: providerId,
    context: {
      account_holder: {
        ...accountHolder,
        data: accountHolder.data ?? {},
      },
    },
  })
  const latest = paymentMethods.slice().sort((left, right) => {
    const leftCreated = Number(left.data?.created) || 0
    const rightCreated = Number(right.data?.created) || 0

    return rightCreated - leftCreated
  })[0]
  const paymentMethodId = latest?.id ?? null
  if (!paymentMethodId) {
    return
  }

  if (
    paymentContext?.payment_method_id === paymentMethodId &&
    paymentContext?.account_holder_id === accountHolder.id
  ) {
    return
  }

  const subscriptionModule = container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
  await subscriptionModule.updateSubscriptions({
    id: subscription.id,
    payment_context: {
      payment_provider_id: providerId,
      account_holder_id: accountHolder.id,
      payment_method_id: paymentMethodId,
    } satisfies SubscriptionPaymentContext,
  })
}
