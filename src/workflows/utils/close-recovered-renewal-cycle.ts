import type { MedusaContainer } from "@medusajs/framework/types"
import { RENEWAL_MODULE } from "../../modules/renewal"
import type RenewalModuleService from "../../modules/renewal/service"
import { RenewalCycleStatus } from "../../modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import type { SubscriptionFrequencyInterval } from "../../modules/subscription/types"
import { addSubscriptionCadence } from "../../modules/subscription/utils/effective-next-renewal"

export type CloseRecoveredRenewalCycleInput = {
  renewal_cycle_id: string | null
  renewal_order_id: string | null
  subscription: {
    id: string
    frequency_interval: SubscriptionFrequencyInterval
    frequency_value: number
  }
  finished_at: Date
}

type RenewalCycleRecord = {
  id: string
  status: RenewalCycleStatus
  scheduled_for: Date | string
  generated_order_id: string | null
}

/**
 * Closes the renewal cycle the way a first-attempt success does once a dunning
 * retry has paid the renewal order: the cycle becomes `succeeded` and linked to
 * the recovered order, and the subscription moves on to its next period.
 *
 * Without this the cycle stays `failed` and `process-renewal-cycles` runs it
 * again, creating a second renewal order and charging the customer twice.
 */
export async function closeRecoveredRenewalCycle(
  container: MedusaContainer,
  input: CloseRecoveredRenewalCycleInput
) {
  if (!input.renewal_cycle_id) {
    return
  }

  const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

  const cycle = (await renewalModule.retrieveRenewalCycle(
    input.renewal_cycle_id
  )) as unknown as RenewalCycleRecord

  if (cycle.status === RenewalCycleStatus.SUCCEEDED) {
    return
  }

  await renewalModule.updateRenewalCycles({
    id: cycle.id,
    status: RenewalCycleStatus.SUCCEEDED,
    processed_at: input.finished_at,
    generated_order_id:
      input.renewal_order_id ?? cycle.generated_order_id ?? null,
    last_error: null,
  })

  await subscriptionModule.updateSubscriptions({
    id: input.subscription.id,
    next_renewal_at: addSubscriptionCadence(
      new Date(cycle.scheduled_for),
      input.subscription.frequency_interval,
      input.subscription.frequency_value
    ),
    last_renewal_at: input.finished_at,
  })
}
