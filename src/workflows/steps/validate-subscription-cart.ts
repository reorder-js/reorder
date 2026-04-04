import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { PlanOfferDiscountPerFrequency } from "../../modules/plan-offer/types"
import { resolveProductSubscriptionConfig } from "../../modules/plan-offer/utils/effective-config"
import {
  SubscriptionFrequencyInterval,
  type SubscriptionPaymentContext,
  type SubscriptionPricingSnapshot,
  type SubscriptionProductSnapshot,
  type SubscriptionShippingAddress,
} from "../../modules/subscription/types"
import { subscriptionErrors } from "../../modules/subscription/utils/errors"

export type ValidateSubscriptionCartStepInput = {
  cart_id: string
}

type CartLineItemRecord = {
  id: string
  quantity: number
  metadata?: Record<string, unknown> | null
  variant?: {
    id: string
    title: string
    sku?: string | null
    product?: {
      id: string
      title: string
    } | null
  } | null
}

type CartRecord = {
  id: string
  completed_at: Date | null
  email: string | null
  customer_id: string | null
  metadata?: Record<string, unknown> | null
  shipping_address?: Record<string, unknown> | null
  customer?: {
    id: string
    email: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
  payment_collection?: {
    id: string
    payment_sessions?: Array<{
      id: string
      provider_id?: string | null
      data?: Record<string, unknown> | null
    }> | null
  } | null
  items?: CartLineItemRecord[] | null
}

export type ValidatedSubscriptionCart = {
  cart_id: string
  customer_id: string
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  customer_snapshot: {
    email: string
    full_name: string | null
  }
  product_snapshot: SubscriptionProductSnapshot
  pricing_snapshot: SubscriptionPricingSnapshot | null
  shipping_address: SubscriptionShippingAddress
  payment_context: SubscriptionPaymentContext
  trial_days: number
}

export const validateSubscriptionCartStep = createStep(
  "validate-subscription-cart",
  async function (
    input: ValidateSubscriptionCartStepInput,
    { container }
  ) {
    const cart = await loadCart(container, input.cart_id)

    if (cart.completed_at) {
      throw subscriptionErrors.conflict(
        `Cart '${input.cart_id}' is already completed`
      )
    }

    if (!cart.customer_id) {
      throw subscriptionErrors.invalidData(
        "Subscription checkout requires a cart linked to a customer"
      )
    }

    validateCartPurchaseMode(cart.metadata)

    const items = cart.items ?? []
    const subscriptionItems = items.filter((item) =>
      isSubscriptionItem(item.metadata)
    )

    if (!subscriptionItems.length) {
      throw subscriptionErrors.invalidData(
        "Subscription checkout requires a subscription line item"
      )
    }

    if (subscriptionItems.length > 1) {
      throw subscriptionErrors.invalidData(
        "Subscription checkout currently supports exactly one subscription line item"
      )
    }

    if (items.length !== subscriptionItems.length) {
      throw subscriptionErrors.invalidData(
        "Mixed carts are not supported for subscription checkout"
      )
    }

    const subscriptionItem = subscriptionItems[0]

    if ((subscriptionItem.quantity ?? 0) !== 1) {
      throw subscriptionErrors.invalidData(
        "Subscription checkout currently supports quantity 1"
      )
    }

    const variantId = subscriptionItem.variant?.id
    const productId = subscriptionItem.variant?.product?.id

    if (!variantId || !productId) {
      throw subscriptionErrors.invalidData(
        "Subscription line item must resolve to a product variant"
      )
    }

    const frequencyInterval = readFrequencyInterval(subscriptionItem.metadata)
    const frequencyValue = readFrequencyValue(subscriptionItem.metadata)
    const effectiveConfig = await resolveProductSubscriptionConfig(container, {
      product_id: productId,
      variant_id: variantId,
    })

    if (!effectiveConfig.is_enabled) {
      throw subscriptionErrors.planChangeNotAllowed(productId, variantId)
    }

    const isAllowedFrequency = effectiveConfig.allowed_frequencies.some(
      (frequency) =>
        String(frequency.interval) === frequencyInterval &&
        frequency.value === frequencyValue
    )

    if (!isAllowedFrequency) {
      throw subscriptionErrors.planChangeFrequencyNotAllowed(
        frequencyInterval,
        frequencyValue
      )
    }

    const pricingSnapshot = buildPricingSnapshot(
      effectiveConfig.discount_per_frequency,
      frequencyInterval,
      frequencyValue
    )

    const paymentContext = buildPaymentContext(cart)

    return new StepResponse<ValidatedSubscriptionCart>({
      cart_id: cart.id,
      customer_id: cart.customer_id,
      frequency_interval: frequencyInterval,
      frequency_value: frequencyValue,
      customer_snapshot: {
        email: readCustomerEmail(cart),
        full_name: buildCustomerName(cart.customer),
      },
      product_snapshot: {
        product_id: productId,
        product_title: subscriptionItem.variant?.product?.title ?? "Unknown product",
        variant_id: variantId,
        variant_title: subscriptionItem.variant?.title ?? "Unknown variant",
        sku: subscriptionItem.variant?.sku ?? null,
      },
      pricing_snapshot: pricingSnapshot,
      shipping_address: buildShippingAddress(cart.shipping_address),
      payment_context: paymentContext,
      trial_days:
        effectiveConfig.rules?.trial_enabled && effectiveConfig.rules.trial_days
          ? effectiveConfig.rules.trial_days
          : 0,
    })
  }
)

async function loadCart(
  container: MedusaContainer,
  cartId: string
): Promise<CartRecord> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "completed_at",
      "email",
      "customer_id",
      "metadata",
      "customer.id",
      "customer.email",
      "customer.first_name",
      "customer.last_name",
      "shipping_address.*",
      "payment_collection.id",
      "payment_collection.payment_sessions.*",
      "items.*",
      "items.variant.id",
      "items.variant.title",
      "items.variant.sku",
      "items.variant.product.id",
      "items.variant.product.title",
    ],
    filters: {
      id: [cartId],
    },
  })

  const cart = (data as CartRecord[])[0]

  if (!cart) {
    throw subscriptionErrors.notFound("Cart", cartId)
  }

  return cart
}

function isSubscriptionItem(metadata?: Record<string, unknown> | null) {
  return readBoolean(metadata?.is_subscription)
}

function validateCartPurchaseMode(metadata?: Record<string, unknown> | null) {
  const purchaseMode = metadata?.purchase_mode

  if (purchaseMode === undefined || purchaseMode === null) {
    return
  }

  if (purchaseMode !== "subscription") {
    throw subscriptionErrors.invalidData(
      "Cart metadata 'purchase_mode' must be 'subscription' for subscription checkout"
    )
  }
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    return value === "true"
  }

  return false
}

function readFrequencyInterval(metadata?: Record<string, unknown> | null) {
  const value = metadata?.frequency_interval

  if (
    value === SubscriptionFrequencyInterval.WEEK ||
    value === SubscriptionFrequencyInterval.MONTH ||
    value === SubscriptionFrequencyInterval.YEAR
  ) {
    return value
  }

  throw subscriptionErrors.invalidData(
    "Subscription line item metadata must include a valid 'frequency_interval'"
  )
}

function readFrequencyValue(metadata?: Record<string, unknown> | null) {
  const raw = metadata?.frequency_value
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN

  if (!Number.isInteger(value) || value <= 0) {
    throw subscriptionErrors.invalidData(
      "Subscription line item metadata must include a positive integer 'frequency_value'"
    )
  }

  return value
}

function buildPricingSnapshot(
  discounts: PlanOfferDiscountPerFrequency[],
  interval: SubscriptionFrequencyInterval,
  value: number
): SubscriptionPricingSnapshot | null {
  const discount = discounts.find(
    (entry) => String(entry.interval) === interval && entry.value === value
  )

  if (!discount) {
    return null
  }

  return {
    discount_type: discount.discount_type,
    discount_value: discount.discount_value,
    label:
      discount.discount_type === "percentage"
        ? `${discount.discount_value}% off`
        : `${discount.discount_value} off`,
  }
}

function buildCustomerName(customer?: CartRecord["customer"]) {
  if (!customer) {
    return null
  }

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()

  return fullName || null
}

function readCustomerEmail(cart: CartRecord) {
  const email = cart.customer?.email ?? cart.email ?? null

  if (!email) {
    throw subscriptionErrors.invalidData(
      "Subscription checkout requires a customer email"
    )
  }

  return email
}

function buildShippingAddress(
  shippingAddress?: Record<string, unknown> | null
): SubscriptionShippingAddress {
  if (!shippingAddress) {
    throw subscriptionErrors.invalidData(
      "Subscription checkout requires a shipping address"
    )
  }

  return {
    first_name: readString(shippingAddress.first_name),
    last_name: readString(shippingAddress.last_name),
    company: readNullableString(shippingAddress.company),
    address_1: readString(shippingAddress.address_1),
    address_2: readNullableString(shippingAddress.address_2),
    city: readString(shippingAddress.city),
    postal_code: readString(shippingAddress.postal_code),
    province: readNullableString(shippingAddress.province),
    country_code: readString(shippingAddress.country_code).toUpperCase(),
    phone: readNullableString(shippingAddress.phone),
  }
}

function buildPaymentContext(cart: CartRecord): SubscriptionPaymentContext {
  const paymentCollectionId = cart.payment_collection?.id ?? null
  const session =
    cart.payment_collection?.payment_sessions?.find((entry) => {
      const data = entry.data ?? {}

      return typeof data.payment_method === "string" && !!data.payment_method
    }) ??
    cart.payment_collection?.payment_sessions?.[0] ??
    null

  const paymentMethodReference =
    typeof session?.data?.payment_method === "string"
      ? session.data.payment_method
      : null

  if (!paymentCollectionId || !session?.id || !session.provider_id) {
    throw subscriptionErrors.invalidData(
      "Subscription checkout requires an initialized payment session"
    )
  }

  if (!paymentMethodReference) {
    throw subscriptionErrors.invalidData(
      "Subscription checkout requires a reusable payment method reference"
    )
  }

  return {
    payment_provider_id: session.provider_id,
    source_payment_collection_id: paymentCollectionId,
    source_payment_session_id: session.id,
    payment_method_reference: paymentMethodReference,
    customer_payment_reference:
      readNullableString(session.data?.customer) ??
      readNullableString(session.data?.customer_id) ??
      null,
  }
}

function readString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw subscriptionErrors.invalidData("Subscription checkout requires complete address data")
  }

  return value.trim()
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
