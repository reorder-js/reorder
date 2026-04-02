import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionAnalyticsExportSchemaType } from "../validators"
import {
  getAdminAnalyticsExportResponse,
  mapAnalyticsAdminRouteError,
} from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<
    unknown,
    GetAdminSubscriptionAnalyticsExportSchemaType
  >,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminAnalyticsExportResponse(
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
