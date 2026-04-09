import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreChangeSubscriptionFrequencySchemaType } from "../../validators"
import { SubscriptionFrequencyInterval } from "../../../../../../../modules/subscription/types"
import { scheduleSubscriptionPlanChangeWorkflow } from "../../../../../../../workflows"
import {
  getOwnedSubscriptionForAction,
  getStoreSubscriptionDetailResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreChangeSubscriptionFrequencySchemaType>,
  res: MedusaResponse
) => {
  const subscription = await getOwnedSubscriptionForAction(req, req.params.id)

  await scheduleSubscriptionPlanChangeWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      requested_by: req.auth_context.actor_id,
      variant_id: subscription.variant_id,
      frequency_interval:
        req.validatedBody.frequency_interval === "week"
          ? SubscriptionFrequencyInterval.WEEK
          : req.validatedBody.frequency_interval === "month"
            ? SubscriptionFrequencyInterval.MONTH
            : SubscriptionFrequencyInterval.YEAR,
      frequency_value: req.validatedBody.frequency_value,
      effective_at: req.validatedBody.effective_at,
    },
  })

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
