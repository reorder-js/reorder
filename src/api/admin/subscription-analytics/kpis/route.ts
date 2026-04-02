import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionAnalyticsKpisSchemaType } from "../validators"
import {
  getAdminAnalyticsKpisResponse,
  mapAnalyticsAdminRouteError,
} from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<
    unknown,
    GetAdminSubscriptionAnalyticsKpisSchemaType
  >,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminAnalyticsKpisResponse(
      req.scope,
      req.validatedQuery
    )
  } catch (error) {
    const mapped = mapAnalyticsAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  res.status(200).json(response)
}
