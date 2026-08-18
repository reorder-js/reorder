import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  getOwnedSubscriptionForAction,
  getStoreSubscriptionPaymentMethodsResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await getOwnedSubscriptionForAction(req, req.params.id)

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionPaymentMethodsResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
