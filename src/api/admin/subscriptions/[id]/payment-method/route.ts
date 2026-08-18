import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostAdminUpdateSubscriptionPaymentMethodSchemaType } from "../../validators"
import { getAdminSubscriptionDetailResponse } from "../../utils"
import { updateSubscriptionPaymentMethodWorkflow } from "../../../../../workflows"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateSubscriptionPaymentMethodSchemaType>,
  res: MedusaResponse
) => {
  await updateSubscriptionPaymentMethodWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      payment_method_id: req.validatedBody.payment_method_id,
      provider_id: req.validatedBody.provider_id ?? null,
      triggered_by: req.auth_context.actor_id,
    },
  })

  const response = await getAdminSubscriptionDetailResponse(
    req.scope,
    req.params.id
  )

  res.status(200).json(response)
}
