import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreRetrySubscriptionPaymentSchemaType } from "../../validators"
import { MedusaError } from "@medusajs/framework/utils"
import { runDunningRetryWorkflow } from "../../../../../../../workflows"
import {
  getOwnedSubscriptionForAction,
  getRetryableDunningCaseForSubscription,
  getStoreSubscriptionDetailResponse,
  requireStoreCustomer,
  sendStoreJson,
} from "../../utils"

function mapStoreRetryError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected subscription retry error"
  const normalized = message.toLowerCase()

  if (normalized.includes("was not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  if (normalized.includes("invalid") || normalized.includes("missing")) {
    return {
      status: 400,
      type: MedusaError.Types.INVALID_DATA,
      message,
    }
  }

  return {
    status: 409,
    type: MedusaError.Types.CONFLICT,
    message,
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreRetrySubscriptionPaymentSchemaType>,
  res: MedusaResponse
) => {
  await getOwnedSubscriptionForAction(req, req.params.id)
  const dunningCase = await getRetryableDunningCaseForSubscription(
    req,
    req.params.id
  )

  try {
    await runDunningRetryWorkflow(req.scope).run({
      input: {
        dunning_case_id: dunningCase.id,
        ignore_schedule: true,
        triggered_by: req.auth_context.actor_id,
        reason: req.validatedBody.reason,
      },
    })
  } catch (error) {
    const mapped = mapStoreRetryError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }

  const customerId = await requireStoreCustomer(req)
  const response = await getStoreSubscriptionDetailResponse(req.scope, {
    customer_id: customerId,
    subscription_id: req.params.id,
  })

  return sendStoreJson(res, response)
}
