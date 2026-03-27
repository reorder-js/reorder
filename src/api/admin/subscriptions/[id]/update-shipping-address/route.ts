import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminUpdateSubscriptionShippingAddressSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { updateSubscriptionShippingAddressWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateSubscriptionShippingAddressSchemaType>,
  res: MedusaResponse
) => {
  await updateSubscriptionShippingAddressWorkflow(req.scope).run({
    input: {
      id: req.params.id,
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

  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
