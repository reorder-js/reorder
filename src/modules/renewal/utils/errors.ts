import { MedusaError } from "@medusajs/framework/utils"

export const renewalErrors = {
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
  invalidTransition(renewalCycleId: string, message?: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      message ??
        `Renewal '${renewalCycleId}' can't transition from its current state`
    )
  },
  alreadyProcessing(renewalCycleId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Renewal '${renewalCycleId}' is already processing`
    )
  },
  approvalNotRequired(renewalCycleId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Renewal '${renewalCycleId}' doesn't require approval`
    )
  },
  approvalAlreadyDecided(renewalCycleId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Renewal '${renewalCycleId}' approval decision has already been made`
    )
  },
  duplicateExecutionBlocked(renewalCycleId: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Duplicate execution for renewal '${renewalCycleId}' was blocked`
    )
  },
  subscriptionNotEligible(subscriptionId: string, reason: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      `Subscription '${subscriptionId}' isn't eligible for renewal: ${reason}`
    )
  },
  renewalOrderCreationFailed(renewalCycleId: string, message?: string) {
    return new MedusaError(
      MedusaError.Types.CONFLICT,
      message ??
        `Renewal order creation failed for renewal '${renewalCycleId}'`
    )
  },
}
