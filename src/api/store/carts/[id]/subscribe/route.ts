import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

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

  const { createSubscriptionFromCartWorkflow } = await import(
    "../../../../../subscription-flows/create-subscription-from-cart.js"
  )

  const { result } = await createSubscriptionFromCartWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
    },
  })

  return res.status(200).json(result)
}
