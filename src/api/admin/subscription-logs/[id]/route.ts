import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionLogSchemaType } from "../validators"
import {
  getAdminSubscriptionLogDetailResponse,
  mapActivityLogAdminRouteError,
} from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminSubscriptionLogSchemaType>,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminSubscriptionLogDetailResponse(
      req.scope,
      req.params.id,
      req.validatedQuery
    )
  } catch (error) {
    const mapped = mapActivityLogAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  res.status(200).json(response)
}
