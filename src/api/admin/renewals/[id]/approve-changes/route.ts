import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminApproveRenewalChangesSchemaType } from "../../validators"
import {
  getAdminRenewalDetailResponse,
  mapRenewalAdminRouteError,
} from "../../utils"
import { approveRenewalChangesWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminApproveRenewalChangesSchemaType>,
  res: MedusaResponse
) => {
  try {
    await approveRenewalChangesWorkflow(req.scope).run({
      input: {
        renewal_cycle_id: req.params.id,
        decided_by: req.auth_context.actor_id,
        reason: req.validatedBody.reason,
      },
    })
  } catch (error) {
    throw mapRenewalAdminRouteError(error)
  }

  const response = await getAdminRenewalDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
