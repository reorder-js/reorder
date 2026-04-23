import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { syncSubscriptionCartPricingWorkflow } from "../../../../../workflows/sync-subscription-cart-pricing"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  if (!req.params.id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cart ID is required."
    )
  }

  const { result } = await syncSubscriptionCartPricingWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
    },
  })

  return res.status(200).json(result)
}
