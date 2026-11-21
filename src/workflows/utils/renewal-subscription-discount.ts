import type {
  IOrderModuleService,
  MedusaContainer,
  UpsertOrderLineItemAdjustmentDTO,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { SubscriptionPricingSnapshot } from "../../modules/subscription/types"

const SUBSCRIPTION_DISCOUNT_ADJUSTMENT_ID = "subscription_discount"
const SUBSCRIPTION_DISCOUNT_DESCRIPTION = "Subscription discount"

type RenewalOrderItemRecord = {
  id: string
  quantity?: number | string | null
  detail?: {
    quantity?: number | string | null
  } | null
  unit_price?: number | string | null
  adjustments?: Array<{
    id: string
    provider_id?: string | null
    code?: string | null
  }> | null
}

type RenewalOrderRecord = {
  id: string
  items?: RenewalOrderItemRecord[] | null
}

// `is_tax_inclusive` is persisted by the Order module but is missing from the
// published `UpsertOrderLineItemAdjustmentDTO` type.
type SubscriptionDiscountAdjustment = UpsertOrderLineItemAdjustmentDTO & {
  is_tax_inclusive: boolean
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100
}

/**
 * Computes the discount for one order line with the same maths that
 * `sync-subscription-cart-pricing` uses at checkout.
 */
export function calculateSubscriptionDiscountAmount(
  pricingSnapshot: Pick<SubscriptionPricingSnapshot, "discount_type" | "discount_value">,
  unitPrice: number,
  quantity: number
) {
  const lineGrossTotal = roundCurrency(unitPrice * Math.max(1, quantity))

  return pricingSnapshot.discount_type === "percentage"
    ? roundCurrency((lineGrossTotal * pricingSnapshot.discount_value) / 100)
    : roundCurrency(Math.min(pricingSnapshot.discount_value, lineGrossTotal))
}

function hasSubscriptionDiscount(item: RenewalOrderItemRecord) {
  return (item.adjustments ?? []).some(
    (adjustment) =>
      adjustment.provider_id === SUBSCRIPTION_DISCOUNT_ADJUSTMENT_ID ||
      adjustment.code === SUBSCRIPTION_DISCOUNT_ADJUSTMENT_ID
  )
}

async function loadRenewalOrder(
  container: MedusaContainer,
  orderId: string
): Promise<RenewalOrderRecord | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.unit_price",
      // `items.quantity` is not returned by a field-limited order query, the
      // ordered quantity lives on the order item detail.
      "items.detail.quantity",
      "items.adjustments.id",
      "items.adjustments.provider_id",
      "items.adjustments.code",
    ],
    filters: {
      id: [orderId],
    },
  })

  return (data as RenewalOrderRecord[])[0]
}

/**
 * Renewal orders are rebuilt from the catalog price, so the discount that
 * checkout applied to the first order has to be re-applied from the
 * subscription's `pricing_snapshot`. It reuses the checkout adjustment shape
 * (`provider_id = "subscription_discount"`) and skips items that already
 * carry one.
 */
export async function applySubscriptionDiscountToRenewalOrder(
  container: MedusaContainer,
  orderId: string,
  pricingSnapshot: SubscriptionPricingSnapshot | null
) {
  const discountValue = Number(pricingSnapshot?.discount_value ?? 0)

  if (!pricingSnapshot?.discount_type || !(discountValue > 0)) {
    return
  }

  const order = await loadRenewalOrder(container, orderId)
  const adjustments = (order?.items ?? []).flatMap(
    (item): SubscriptionDiscountAdjustment[] => {
      if (hasSubscriptionDiscount(item)) {
        return []
      }

      const amount = calculateSubscriptionDiscountAmount(
        { discount_type: pricingSnapshot.discount_type, discount_value: discountValue },
        Number(item.unit_price ?? 0),
        Number(item.detail?.quantity ?? item.quantity ?? 1)
      )

      if (!(amount > 0)) {
        return []
      }

      return [
        {
          item_id: item.id,
          amount,
          is_tax_inclusive: true,
          description: SUBSCRIPTION_DISCOUNT_DESCRIPTION,
          code: SUBSCRIPTION_DISCOUNT_ADJUSTMENT_ID,
          provider_id: SUBSCRIPTION_DISCOUNT_ADJUSTMENT_ID,
        },
      ]
    }
  )

  if (!adjustments.length) {
    return
  }

  const orderModule = container.resolve<IOrderModuleService>(Modules.ORDER)

  await orderModule.upsertOrderLineItemAdjustments(adjustments)
}
