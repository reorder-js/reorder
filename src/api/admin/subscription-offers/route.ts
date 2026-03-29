import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type {
  GetAdminSubscriptionOffersSchemaType,
  PostAdminCreateSubscriptionOfferSchemaType,
} from "./validators"
import {
  getAdminSubscriptionOfferDetailResponse,
  getAdminSubscriptionOffersListResponse,
} from "./utils"
import { createOrUpsertPlanOfferWorkflow } from "../../../workflows"

export const GET = async (
  req: AuthenticatedMedusaRequest<
    unknown,
    GetAdminSubscriptionOffersSchemaType
  >,
  res: MedusaResponse
) => {
  const response = await getAdminSubscriptionOffersListResponse(
    req.scope,
    req.validatedQuery
  )

  res.status(200).json(response)
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreateSubscriptionOfferSchemaType>,
  res: MedusaResponse
) => {
  const { result } = await createOrUpsertPlanOfferWorkflow(
    req.scope
  ).run({
    input: req.validatedBody,
  })
  const planOfferId = result as string

  const response = await getAdminSubscriptionOfferDetailResponse(
    req.scope,
    planOfferId
  )

  res.status(200).json(response)
}
