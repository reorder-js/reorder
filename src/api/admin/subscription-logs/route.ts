import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminSubscriptionLogsSchemaType } from "./validators"
import {
  getAdminSubscriptionLogsListResponse,
  mapActivityLogAdminRouteError,
} from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminSubscriptionLogsSchemaType>,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminSubscriptionLogsListResponse(
      req.scope,
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
