import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminSmartCancelSchemaType } from "../../validators"
import {
  getAdminCancellationDetailResponse,
  mapCancellationAdminRouteError,
} from "../../utils"
import { smartCancellationWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSmartCancelSchemaType>,
  res: MedusaResponse
) => {
  try {
    await smartCancellationWorkflow(req.scope).run({
      input: {
        cancellation_case_id: req.params.id,
        evaluated_by: req.validatedBody.evaluated_by ?? req.auth_context.actor_id,
        metadata: req.validatedBody.metadata,
      },
    })
  } catch (error) {
    const mapped = mapCancellationAdminRouteError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  const response = await getAdminCancellationDetailResponse(req.scope, req.params.id)

  return res.status(200).json(response)
}
