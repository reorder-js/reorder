import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  getAdminSubscriptionSettingsResponse,
  mapSubscriptionSettingsAdminRouteError,
  updateAdminSubscriptionSettingsResponse,
} from "./utils"
import type { PostAdminSubscriptionSettingsSchemaType } from "./validators"

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
  req: AuthenticatedMedusaRequest<PostAdminSubscriptionSettingsSchemaType>,
  res: MedusaResponse
) => {
  try {
    const response = await updateAdminSubscriptionSettingsResponse(
      req.scope,
      req.validatedBody,
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
