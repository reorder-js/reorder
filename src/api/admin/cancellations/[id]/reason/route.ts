import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminUpdateCancellationReasonSchemaType } from "../../validators"
import {
  getAdminCancellationDetailResponse,
  mapCancellationAdminRouteError,
} from "../../utils"
import { updateCancellationReasonWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateCancellationReasonSchemaType>,
  res: MedusaResponse
) => {
  try {
    await updateCancellationReasonWorkflow(req.scope).run({
      input: {
        cancellation_case_id: req.params.id,
        reason: req.validatedBody.reason,
        reason_category: req.validatedBody.reason_category,
        notes: req.validatedBody.notes,
        updated_by: req.validatedBody.updated_by ?? req.auth_context.actor_id,
        update_reason: req.validatedBody.update_reason,
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
