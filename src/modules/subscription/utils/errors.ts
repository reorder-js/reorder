import { MedusaError } from "@medusajs/framework/utils"

export const subscriptionErrors = {
  notFound(entity: string, id: string) {
    return new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `${entity} '${id}' was not found`
    )
  },
  invalidState(id: string, action: string, status: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Subscription '${id}' can't ${action} from status '${status}'`
    )
  },
  invalidData(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  conflict(message: string) {
    return new MedusaError(MedusaError.Types.CONFLICT, message)
  },
}
