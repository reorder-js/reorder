import type { MedusaContainer } from "@medusajs/framework/types"
import { getAdminOrderSubscriptionSummary } from "../../../modules/subscription/utils/admin-query"

export async function getAdminOrderSubscriptionSummaryResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminOrderSubscriptionSummary(container, id)
}
