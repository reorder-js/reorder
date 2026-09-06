import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreUpdateSubscriptionPaymentMethodSchemaType } from "../../validators"
import { ActivityLogActorType } from "../../../../../../../modules/activity-log/types"
import { updateSubscriptionPaymentMethodWorkflow } from "../../../../../../../workflows"
import {
  getOwnedSubscriptionForAction,
  getStoreSubscriptionDetailResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreUpdateSubscriptionPaymentMethodSchemaType>,
  res: MedusaResponse
) => {
  await getOwnedSubscriptionForAction(req, req.params.id)

  await updateSubscriptionPaymentMethodWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      payment_method_id: req.validatedBody.payment_method_id,
      provider_id: req.validatedBody.provider_id ?? null,
      triggered_by: req.auth_context.actor_id,
      actor_type: ActivityLogActorType.CUSTOMER,
    },
  })

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
