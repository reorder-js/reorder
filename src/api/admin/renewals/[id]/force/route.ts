import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminForceRenewalSchemaType } from "../../validators"
import { getAdminRenewalDetailResponse } from "../../utils"
import { forceRenewalCycleWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminForceRenewalSchemaType>,
  res: MedusaResponse
) => {
  await forceRenewalCycleWorkflow(req.scope).run({
    input: {
      renewal_cycle_id: req.params.id,
      triggered_by: req.auth_context.actor_id,
      reason: req.validatedBody.reason,
    },
  })

  const response = await getAdminRenewalDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
