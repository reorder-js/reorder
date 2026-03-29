import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminUpdateSubscriptionOfferSchemaType } from "../validators"
import { getAdminSubscriptionOfferDetailResponse } from "../utils"
import { updatePlanOfferWorkflow } from "../../../../workflows"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const response = await getAdminSubscriptionOfferDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateSubscriptionOfferSchemaType>,
  res: MedusaResponse
) => {
  await updatePlanOfferWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      ...req.validatedBody,
    },
  })

  const response = await getAdminSubscriptionOfferDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
