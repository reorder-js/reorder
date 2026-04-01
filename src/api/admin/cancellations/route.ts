import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminCancellationsSchemaType } from "./validators"
import {
  getAdminCancellationsListResponse,
  mapCancellationAdminRouteError,
} from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminCancellationsSchemaType>,
  res: MedusaResponse
) => {
  let response

  try {
    response = await getAdminCancellationsListResponse(
      req.scope,
      req.validatedQuery
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
