import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionOffersSchemaType } from "./validators"
import { getAdminSubscriptionOffersListResponse } from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<
    unknown,
    GetAdminSubscriptionOffersSchemaType
  >,
  res: MedusaResponse
) => {
  const response = await getAdminSubscriptionOffersListResponse(
    req.scope,
    req.validatedQuery
  )

  res.status(200).json(response)
}
