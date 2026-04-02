import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminCancelSubscriptionSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { cancelSubscriptionWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCancelSubscriptionSchemaType>,
  res: MedusaResponse
) => {
  await cancelSubscriptionWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      triggered_by: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })

  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
