import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  getAdminDunningDetailResponse,
  mapDunningAdminRouteError,
} from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminDunningDetailResponse(
      req.scope,
      req.params.id
    )
  } catch (error) {
    const mapped = mapDunningAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  res.status(200).json(response)
}
