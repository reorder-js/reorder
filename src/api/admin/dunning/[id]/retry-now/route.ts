import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminRetryNowDunningSchemaType } from "../../validators"
import { getAdminDunningDetailResponse, mapDunningAdminRouteError } from "../../utils"
import { runDunningRetryWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminRetryNowDunningSchemaType>,
  res: MedusaResponse
) => {
  try {
    await runDunningRetryWorkflow(req.scope).run({
      input: {
        dunning_case_id: req.params.id,
        ignore_schedule: true,
        triggered_by: req.auth_context.actor_id,
        reason: req.validatedBody.reason,
      },
    })
  } catch (error) {
    const mapped = mapDunningAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  const response = await getAdminDunningDetailResponse(req.scope, req.params.id)

  return res.status(200).json(response)
}
