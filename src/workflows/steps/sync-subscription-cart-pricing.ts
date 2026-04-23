import type { ICartModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { resolveProductSubscriptionConfig } from "../../modules/plan-offer/utils/effective-config"

type SyncSubscriptionCartPricingStepInput = {
  cart_id: string
}

type CartLineItemRecord = {
  quantity?: number | null
  id: string
  unit_price?: number | null
  subtotal?: number | null
  total?: number | null
  original_total?: number | null
  tax_total?: number | null
  original_tax_total?: number | null
  metadata?: Record<string, unknown> | null
  adjustments?: Array<{
    id: string
    code?: string | null
    amount?: number | null
    is_tax_inclusive?: boolean | null
    provider_id?: string | null
  }> | null
  variant?: {
    id?: string | null
    product?: {
      id?: string | null
    } | null
  } | null
}

type CartRecord = {
  id: string
  completed_at?: Date | null
  items?: CartLineItemRecord[] | null
}

export type SyncSubscriptionCartPricingStepResult = {
  adjustments_changed: boolean
  has_subscription_items: boolean
}

export const syncSubscriptionCartPricingStep = createStep(
  "sync-subscription-cart-pricing",
  async function (
    input: SyncSubscriptionCartPricingStepInput,
    { container }
  ) {
    const cart = await loadCart(container, input.cart_id)

    if (cart.completed_at) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Cart '${input.cart_id}' is already completed`
      )
    }

    const items = cart.items ?? []
    const subscriptionItems = items.filter((item) => isSubscriptionItem(item.metadata))

    if (!subscriptionItems.length) {
      return new StepResponse<SyncSubscriptionCartPricingStepResult>({
        adjustments_changed: false,
        has_subscription_items: false,
      })
    }

    const cartModule = container.resolve<ICartModuleService>(Modules.CART)
    let adjustmentsChanged = false

    for (const item of subscriptionItems) {
      const variantId = item.variant?.id
      const productId = item.variant?.product?.id
      const quantity = Math.max(1, Number(item.quantity ?? 1))
      const lineGrossTotal =
        item.original_total ??
        item.total ??
        (item.unit_price != null ? roundCurrency(item.unit_price * quantity) : 0)

      const existingAdjustments = (item.adjustments ?? [])
        .filter(
          (adjustment) =>
            adjustment.code !== "subscription_discount" &&
            adjustment.provider_id !== "subscription_discount"
        )
        .map((adjustment) => ({
          id: adjustment.id,
          item_id: item.id,
        }))

      const existingSubscriptionAdjustment = (item.adjustments ?? []).find(
        (adjustment) =>
          adjustment.code === "subscription_discount" ||
          adjustment.provider_id === "subscription_discount"
      )

      if (!variantId || !productId || lineGrossTotal <= 0) {
        if (existingSubscriptionAdjustment) {
          await cartModule.setLineItemAdjustments(cart.id, existingAdjustments)
          adjustmentsChanged = true
        }
        continue
      }

      let effectiveConfig: Awaited<ReturnType<typeof resolveProductSubscriptionConfig>>

      try {
        effectiveConfig = await resolveProductSubscriptionConfig(container, {
          product_id: productId,
          variant_id: variantId,
        })
      } catch {
        if (existingSubscriptionAdjustment) {
          await cartModule.setLineItemAdjustments(cart.id, existingAdjustments)
          adjustmentsChanged = true
        }
        continue
      }

      if (!effectiveConfig.is_enabled) {
        if (existingSubscriptionAdjustment) {
          await cartModule.setLineItemAdjustments(cart.id, existingAdjustments)
          adjustmentsChanged = true
        }
        continue
      }

      const interval = String(item.metadata?.frequency_interval ?? "")
      const value = Number(item.metadata?.frequency_value ?? 0)
      const discount = effectiveConfig.discount_per_frequency.find(
        (record) => String(record.interval) === interval && record.value === value
      )

      if (!discount) {
        if (existingSubscriptionAdjustment) {
          await cartModule.setLineItemAdjustments(cart.id, existingAdjustments)
          adjustmentsChanged = true
        }
        continue
      }

      const amount =
        discount.discount_type === "percentage"
          ? roundCurrency((lineGrossTotal * discount.discount_value) / 100)
          : roundCurrency(Math.min(discount.discount_value, lineGrossTotal))

      if (amount <= 0) {
        if (existingSubscriptionAdjustment) {
          await cartModule.setLineItemAdjustments(cart.id, existingAdjustments)
          adjustmentsChanged = true
        }
        continue
      }

      if (
        existingSubscriptionAdjustment?.amount === amount &&
        existingSubscriptionAdjustment?.is_tax_inclusive === true &&
        existingSubscriptionAdjustment?.provider_id === "subscription_discount"
      ) {
        continue
      }

      await cartModule.setLineItemAdjustments(cart.id, [
        ...existingAdjustments,
        {
          item_id: item.id,
          amount,
          is_tax_inclusive: true,
          description: "Subscription discount",
          provider_id: "subscription_discount",
        } as any,
      ])
      adjustmentsChanged = true
    }

    return new StepResponse<SyncSubscriptionCartPricingStepResult>({
      adjustments_changed: adjustmentsChanged,
      has_subscription_items: true,
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
      "items.id",
      "items.quantity",
      "items.unit_price",
      "items.subtotal",
      "items.total",
      "items.original_total",
      "items.tax_total",
      "items.original_tax_total",
      "items.metadata",
      "items.adjustments.id",
      "items.adjustments.code",
      "items.adjustments.amount",
      "items.adjustments.is_tax_inclusive",
      "items.adjustments.provider_id",
      "items.variant.id",
      "items.variant.product.id",
    ],
    filters: {
      id: [cartId],
    },
  })

  const cart = (data as CartRecord[])[0]

  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart '${cartId}' was not found`)
  }

  return cart
}

function isSubscriptionItem(metadata?: Record<string, unknown> | null) {
  const value = metadata?.is_subscription
  return value === true || value === "true"
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100
}
