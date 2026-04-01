import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  getAdminCancellationDetailResponse,
  mapCancellationAdminRouteError,
} from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminCancellationDetailResponse(
      req.scope,
      req.params.id
    )
  } catch (error) {
    const mapped = mapCancellationAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  res.status(200).json(response)
}
