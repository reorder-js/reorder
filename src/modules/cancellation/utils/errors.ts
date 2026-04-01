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
  invalidCaseState(cancellationCaseId: string, action: string, status: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `CancellationCase '${cancellationCaseId}' can't ${action} from status '${status}'`
    )
  },
  alreadyFinalized(cancellationCaseId: string, status: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `CancellationCase '${cancellationCaseId}' is already finalized with status '${status}'`
    )
  },
  missingCancellationReason(cancellationCaseId: string) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `CancellationCase '${cancellationCaseId}' requires a reason before final cancellation`
    )
  },
  offerOutOfPolicy(cancellationCaseId: string, offerType: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Retention offer '${offerType}' is out of policy for CancellationCase '${cancellationCaseId}'`
    )
  },
}
