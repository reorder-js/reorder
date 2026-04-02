import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminResumeSubscriptionSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { resumeSubscriptionWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminResumeSubscriptionSchemaType>,
  res: MedusaResponse
) => {
  await resumeSubscriptionWorkflow(req.scope).run({
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
