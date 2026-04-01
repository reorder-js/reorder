import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminApplyRetentionOfferSchemaType } from "../../validators"
import {
  getAdminCancellationDetailResponse,
  mapCancellationAdminRouteError,
} from "../../utils"
import { applyRetentionOfferWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminApplyRetentionOfferSchemaType>,
  res: MedusaResponse
) => {
  try {
    await applyRetentionOfferWorkflow(req.scope).run({
      input: {
        cancellation_case_id: req.params.id,
        offer_type: req.validatedBody.offer_type,
        offer_payload: req.validatedBody.offer_payload,
        decided_by: req.validatedBody.decided_by ?? req.auth_context.actor_id,
        decision_reason: req.validatedBody.decision_reason,
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
