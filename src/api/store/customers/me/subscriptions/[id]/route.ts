import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveOwnedSubscriptionDetail, sendStoreJson } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const response = await retrieveOwnedSubscriptionDetail(req, req.params.id)

  return sendStoreJson(res, response)
}
