import { MedusaError } from "@medusajs/framework/utils"

export const cancellationErrors = {
  notFound(entity: string, id: string) {
    return new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `${entity} '${id}' was not found`
    )
  },
  invalidData(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  conflict(message: string) {
    return new MedusaError(MedusaError.Types.CONFLICT, message)
  },
  multipleActiveCases(subscriptionId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Subscription '${subscriptionId}' has multiple active cancellation cases`
    )
  },
}
