import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminPauseSubscriptionSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { pauseSubscriptionWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminPauseSubscriptionSchemaType>,
  res: MedusaResponse
) => {
  await pauseSubscriptionWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      ...req.validatedBody,
    },
  })

  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
