import type { CartWorkflowDTO } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { canCompleteCart } from "../../common/utils/can-complete-cart"

export const validateNoSubscriptionItemsInCart = (cart: CartWorkflowDTO): void => {
  if (!canCompleteCart(cart)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Unable to directly complete cart with subscription items",
    )
  }
}
