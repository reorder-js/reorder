import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreChangeSubscriptionAddressSchemaType } from "../../validators"
import { updateSubscriptionShippingAddressWorkflow } from "../../../../../../../workflows"
import {
  getOwnedSubscriptionForAction,
  getStoreSubscriptionDetailResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreChangeSubscriptionAddressSchemaType>,
  res: MedusaResponse
) => {
  await getOwnedSubscriptionForAction(req, req.params.id)

  await updateSubscriptionShippingAddressWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      triggered_by: req.auth_context.actor_id,
      first_name: req.validatedBody.first_name,
      last_name: req.validatedBody.last_name,
      company: req.validatedBody.company ?? null,
      address_1: req.validatedBody.address_1,
      address_2: req.validatedBody.address_2 ?? null,
      city: req.validatedBody.city,
      postal_code: req.validatedBody.postal_code,
      province: req.validatedBody.province ?? null,
      country_code: req.validatedBody.country_code,
      phone: req.validatedBody.phone ?? null,
    },
  })

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
