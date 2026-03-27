import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionsSchemaType } from "./validators"
import { getAdminSubscriptionsListResponse } from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminSubscriptionsSchemaType>,
  res: MedusaResponse
) => {
  const response = await getAdminSubscriptionsListResponse(
    req.scope,
    req.validatedQuery
  )

  res.status(200).json(response)
}
