import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { PostStoreStartCancellationSchemaType } from "../../validators"
import { startCancellationCaseWorkflow } from "../../../../../../../workflows"
import { retrieveOwnedSubscription, sendStoreJson } from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreStartCancellationSchemaType>,
  res: MedusaResponse
) => {
  const subscriptionId = req.params.id

  await retrieveOwnedSubscription(req, subscriptionId)

  const { result } = await startCancellationCaseWorkflow(req.scope).run({
    input: {
      subscription_id: subscriptionId,
      reason: req.validatedBody.reason,
      reason_category: req.validatedBody.reason_category,
      notes: req.validatedBody.notes,
      metadata: req.validatedBody.metadata,
      entry_context: {
        source: "subscription_list",
        triggered_by: req.auth_context?.actor_id ?? null,
        reason: req.validatedBody.reason,
      },
    },
  })

  return sendStoreJson(res, {
    cancellation_case: {
      id: result.current.id,
      status: result.current.status,
      subscription_id: result.current.subscription_id,
      reason: result.current.reason,
      reason_category: result.current.reason_category,
      notes: result.current.notes,
      created_at: result.current.created_at,
      updated_at: result.current.updated_at,
    },
  })
}
