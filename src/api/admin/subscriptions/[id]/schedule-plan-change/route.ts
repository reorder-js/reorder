import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminScheduleSubscriptionPlanChangeSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { scheduleSubscriptionPlanChangeWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminScheduleSubscriptionPlanChangeSchemaType>,
  res: MedusaResponse
) => {
  await scheduleSubscriptionPlanChangeWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      requested_by: req.auth_context.actor_id,
      variant_id: req.validatedBody.variant_id,
      frequency_interval: req.validatedBody.frequency_interval,
      frequency_value: req.validatedBody.frequency_value,
      effective_at: req.validatedBody.effective_at,
    },
  })

  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
