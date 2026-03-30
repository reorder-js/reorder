import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminDunningCasesSchemaType } from "./validators"
import {
  getAdminDunningCasesListResponse,
  mapDunningAdminRouteError,
} from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminDunningCasesSchemaType>,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminDunningCasesListResponse(
      req.scope,
      req.validatedQuery
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
