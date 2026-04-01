import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminFinalizeCancellationSchemaType } from "../../validators"
import {
  getAdminCancellationDetailResponse,
  mapCancellationAdminRouteError,
} from "../../utils"
import { finalizeCancellationWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminFinalizeCancellationSchemaType>,
  res: MedusaResponse
) => {
  try {
    await finalizeCancellationWorkflow(req.scope).run({
      input: {
        cancellation_case_id: req.params.id,
        reason: req.validatedBody.reason,
        reason_category: req.validatedBody.reason_category,
        notes: req.validatedBody.notes,
        finalized_by: req.validatedBody.finalized_by ?? req.auth_context.actor_id,
        effective_at: req.validatedBody.effective_at,
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
