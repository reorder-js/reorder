import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetAdminRenewalsSchemaType } from "./validators"
import { getAdminRenewalsListResponse } from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetAdminRenewalsSchemaType>,
  res: MedusaResponse
) => {
  const response = await getAdminRenewalsListResponse(
    req.scope,
    req.validatedQuery
  )

  res.status(200).json(response)
}
