import type { IOrderModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

type LabelSubscriptionOrderAdjustmentsStepInput = {
  order_id: string
}

type OrderAdjustmentRecord = {
  id: string
  code?: string | null
  provider_id?: string | null
  item_id: string
  amount?: number | null
}

type OrderRecord = {
  id: string
  items?: Array<{
    id: string
    adjustments?: OrderAdjustmentRecord[] | null
  }> | null
}

type PreviousAdjustmentCode = {
  id: string
  item_id: string
  code?: string | null
}

export const labelSubscriptionOrderAdjustmentsStep = createStep(
  "label-subscription-order-adjustments",
  async function (
    input: LabelSubscriptionOrderAdjustmentsStepInput,
    { container }
  ) {
    const order = await loadOrder(container, input.order_id)

    const adjustmentsToUpdate = (order.items ?? [])
      .flatMap((item) => item.adjustments ?? [])
      .filter(
        (adjustment) =>
          adjustment.provider_id === "subscription_discount" &&
          adjustment.code !== "subscription_discount"
      )

    if (!adjustmentsToUpdate.length) {
      return new StepResponse<void, PreviousAdjustmentCode[]>(undefined, [])
    }

    const orderModule = container.resolve<IOrderModuleService>(Modules.ORDER)

    await orderModule.upsertOrderLineItemAdjustments(
      adjustmentsToUpdate.map((adjustment) => ({
        id: adjustment.id,
        item_id: adjustment.item_id,
        amount: adjustment.amount ?? 0,
        code: "subscription_discount",
        provider_id: adjustment.provider_id ?? undefined,
      }))
    )

    return new StepResponse<void, PreviousAdjustmentCode[]>(
      undefined,
      adjustmentsToUpdate.map((adjustment) => ({
        id: adjustment.id,
        item_id: adjustment.item_id,
        code: adjustment.code ?? null,
      }))
    )
  },
  async function (previousAdjustments, { container }) {
    if (!previousAdjustments?.length) {
      return
    }

    const orderModule = container.resolve<IOrderModuleService>(Modules.ORDER)

    await orderModule.upsertOrderLineItemAdjustments(
      previousAdjustments.map((adjustment) => ({
        id: adjustment.id,
        item_id: adjustment.item_id,
        code: adjustment.code ?? undefined,
      }))
    )
  }
)

async function loadOrder(
  container: MedusaContainer,
  orderId: string
): Promise<OrderRecord> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.adjustments.id",
      "items.adjustments.item_id",
      "items.adjustments.code",
      "items.adjustments.provider_id",
      "items.adjustments.amount",
    ],
    filters: {
      id: [orderId],
    },
  })

  return (data as OrderRecord[])[0]
}
