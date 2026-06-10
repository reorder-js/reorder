import type { CartWorkflowDTO } from "@medusajs/framework/types"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"
import { canCompleteCart } from "../../common/utils/can-complete-cart"

completeCartWorkflow.hooks.validate((data) => {
  const cart: CartWorkflowDTO = data.cart

  if (!canCompleteCart(cart)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unable to directly complete cart with subscription items")
  }
})
