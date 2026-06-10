import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CartCompleteAllowedMetadataKey } from "../../common/utils/can-complete-cart"
import { Modules } from "@medusajs/framework/utils"

export type AddCompleteAllowedMetadataEntryStepInput = {
  cartId: string
}

export const addCompleteAllowedMetadataEntryStep = createStep("add-complete-allowed-metadata-entry", async ({ cartId }: AddCompleteAllowedMetadataEntryStepInput, { container }) => {
  const cartService = container.resolve(Modules.CART)

  const cart = await cartService.retrieveCart(cartId)

  await cartService.updateCarts(cartId, {
    metadata: { ...cart.metadata, [CartCompleteAllowedMetadataKey]: true },
  })

  return new StepResponse(null, cart)
}, async (cartBefore, { container }) => {
  if (!cartBefore) return

  const cartService = container.resolve(Modules.CART)

  await cartService.updateCarts(cartBefore.id, {
    metadata: cartBefore.metadata,
  })
})
