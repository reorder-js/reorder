import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { getAdminDunningDetail } from "../../../modules/dunning/utils/admin-query"

export async function getAdminDunningDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminDunningDetail(container, id)
}

export function mapDunningAdminRouteError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected dunning admin error"
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
