import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreResumeSubscriptionSchemaType } from "../../validators"
import { resumeSubscriptionWorkflow } from "../../../../../../../workflows"
import {
  getOwnedSubscriptionForAction,
  getStoreSubscriptionDetailResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreResumeSubscriptionSchemaType>,
  res: MedusaResponse
) => {
  await getOwnedSubscriptionForAction(req, req.params.id)

  await resumeSubscriptionWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      triggered_by: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
