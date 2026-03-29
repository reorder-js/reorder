import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminToggleSubscriptionOfferSchemaType } from "../../validators"
import { getAdminSubscriptionOfferDetailResponse } from "../../utils"
import { togglePlanOfferWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminToggleSubscriptionOfferSchemaType>,
  res: MedusaResponse
) => {
  await togglePlanOfferWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      is_enabled: req.validatedBody.is_enabled,
    },
  })

  const response = await getAdminSubscriptionOfferDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
