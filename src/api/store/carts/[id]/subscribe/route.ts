import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createSubscriptionFromCartWorkflow } from "../../../../../subscription-flows/create-subscription-from-cart"
import type { HttpTypes } from "@medusajs/framework/types"

export const POST = async (
  req: MedusaRequest<unknown, HttpTypes.SelectParams>,
  res: MedusaResponse
) => {
  if (!req.params.id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cart ID is required."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createSubscriptionFromCartWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
    },
  })

  const { data } = await query.graph({
    entity: "order",
    fields: req.queryConfig.fields,
    filters: { id: result.order.id },
  })

  return res.status(200).json({
    type: "order",
    order: data[0],
  })
}
