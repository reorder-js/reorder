import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getAdminSubscriptionDetailResponse } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
