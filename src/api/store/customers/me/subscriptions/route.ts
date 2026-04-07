import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listStoreCustomerSubscriptions, sendStoreJson } from "./utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const response = await listStoreCustomerSubscriptions(req)

  return sendStoreJson(res, response)
}
