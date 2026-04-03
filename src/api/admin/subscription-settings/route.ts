import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  getAdminSubscriptionSettingsResponse,
  mapSubscriptionSettingsAdminRouteError,
  updateAdminSubscriptionSettingsResponse,
  type PostAdminSubscriptionSettingsBody,
} from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  try {
    const response = await getAdminSubscriptionSettingsResponse(req.scope)

    return res.status(200).json(response)
  } catch (error) {
    const mapped = mapSubscriptionSettingsAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSubscriptionSettingsBody>,
  res: MedusaResponse
) => {
  try {
    const response = await updateAdminSubscriptionSettingsResponse(
      req.scope,
      req.body ?? {},
      req.auth_context.actor_id
    )

    return res.status(200).json(response)
  } catch (error) {
    const mapped = mapSubscriptionSettingsAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }
}
