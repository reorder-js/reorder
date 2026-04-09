import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { GetStoreProductSubscriptionOfferSchemaType } from "../../validators"
import {
  getStoreProductSubscriptionOfferResponse,
  sendStoreJson,
} from "../../../customers/me/subscriptions/utils"

export const GET = async (
  req: MedusaRequest<unknown, GetStoreProductSubscriptionOfferSchemaType>,
  res: MedusaResponse
) => {
  const response = await getStoreProductSubscriptionOfferResponse(req)

  return sendStoreJson(res, response)
}
