import { MedusaError } from "@medusajs/framework/utils"

export const dunningErrors = {
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
  duplicateActiveCaseBlocked(subscriptionId: string, activeCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Duplicate active dunning case blocked for subscription '${subscriptionId}'. Active case '${activeCaseId}' must be resolved first`
    )
  },
  retryAlreadyProcessing(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' retry is already processing`
    )
  },
  retryNotDue(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' retry is not due`
    )
  },
  maxAttemptsExceeded(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' max attempts exceeded`
    )
  },
  alreadyRecovered(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' is already recovered`
    )
  },
  alreadyUnrecovered(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' is already unrecovered`
    )
  },
  retryInFlightTransitionBlocked(dunningCaseId: string, action: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' can't ${action} while retry is in flight`
    )
  },
  invalidRetryScheduleOverride(dunningCaseId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `DunningCase '${dunningCaseId}' retry schedule override didn't produce a valid next_retry_at`
    )
  },
}
