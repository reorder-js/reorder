import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RENEWAL_MODULE } from "../../modules/renewal"
import type RenewalModuleService from "../../modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../modules/renewal/types"
import {
  deriveUpcomingRenewalApprovalState,
  findUpcomingRenewalCycle,
  type UpcomingRenewalCycleRecord,
  type UpcomingRenewalSubscriptionRecord,
  shouldSubscriptionHaveUpcomingRenewalCycle,
} from "../../modules/renewal/utils/upcoming-cycle"
import { SubscriptionRenewalBehavior } from "../../modules/settings/types"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import type SubscriptionModuleService from "../../modules/subscription/service"
import { getEffectiveSubscriptionSettings } from "../utils/subscription-settings"

export type EnsureNextRenewalCycleStepInput = {
  subscription_id: string
}

type EnsureNextRenewalCycleStepOutput = {
  action: "noop" | "created" | "updated" | "deleted"
  subscription_id: string
  renewal_cycle_id: string | null
}

type EnsureNextRenewalCycleCompensation =
  | {
      action: "created"
      renewal_cycle_id: string
    }
  | {
      action: "updated"
      previous: {
        id: string
        approval_required: boolean
        approval_status: RenewalApprovalStatus | null
        approval_decided_at: Date | null
        approval_decided_by: string | null
        approval_reason: string | null
      }
    }
  | {
      action: "deleted"
      previous: Array<{
        id: string
        subscription_id: string
        scheduled_for: Date
        processed_at: Date | null
        status: RenewalCycleStatus
        approval_required: boolean
        approval_status: RenewalApprovalStatus | null
        approval_decided_at: Date | null
        approval_decided_by: string | null
        approval_reason: string | null
        generated_order_id: string | null
        applied_pending_update_data: Record<string, unknown> | null
        last_error: string | null
        attempt_count: number
        metadata: Record<string, unknown> | null
      }>
    }

export const ensureNextRenewalCycleStep = createStep(
  "ensure-next-renewal-cycle",
  async function (
    input: EnsureNextRenewalCycleStepInput,
    { container }
  ) {
    const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)
    const subscriptionModule =
      container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

    const subscription =
      (await subscriptionModule.retrieveSubscription(
        input.subscription_id
      )) as UpcomingRenewalSubscriptionRecord

    const existingCycles = (await renewalModule.listRenewalCycles({
      subscription_id: subscription.id,
    } as any)) as UpcomingRenewalCycleRecord[]

    if (!shouldSubscriptionHaveUpcomingRenewalCycle(subscription)) {
      const scheduledCycles = existingCycles.filter(
        (cycle) => cycle.status === RenewalCycleStatus.SCHEDULED
      )

      if (scheduledCycles.length) {
        await renewalModule.deleteRenewalCycles(
          scheduledCycles.map((cycle) => cycle.id)
        )

        return new StepResponse<
          EnsureNextRenewalCycleStepOutput,
          EnsureNextRenewalCycleCompensation
        >(
          {
            action: "deleted",
            subscription_id: subscription.id,
            renewal_cycle_id: null,
          },
          {
            action: "deleted",
            previous: scheduledCycles.map((cycle) => ({
              id: cycle.id,
              subscription_id: cycle.subscription_id,
              scheduled_for: cycle.scheduled_for,
              processed_at: cycle.processed_at,
              status: cycle.status,
              approval_required: cycle.approval_required,
              approval_status: cycle.approval_status,
              approval_decided_at: cycle.approval_decided_at,
              approval_decided_by: cycle.approval_decided_by,
              approval_reason: cycle.approval_reason,
              generated_order_id: cycle.generated_order_id,
              applied_pending_update_data: cycle.applied_pending_update_data,
              last_error: cycle.last_error,
              attempt_count: cycle.attempt_count,
              metadata: cycle.metadata,
            })),
          }
        )
      }

      return new StepResponse<
        EnsureNextRenewalCycleStepOutput,
        EnsureNextRenewalCycleCompensation
      >(
        {
          action: "noop",
          subscription_id: subscription.id,
          renewal_cycle_id: null,
        }
      )
    }

    const scheduledFor = subscription.next_renewal_at!
    const settings = await getEffectiveSubscriptionSettings(container)
    const existingCycle = findUpcomingRenewalCycle(existingCycles, scheduledFor)

    if (!existingCycle) {
      const createTimeBehavior = settings.is_persisted
        ? settings.default_renewal_behavior
        : SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES

      const approvalState = deriveUpcomingRenewalApprovalState(
        subscription,
        scheduledFor,
        createTimeBehavior
      )
      const created = await renewalModule.createRenewalCycles({
        subscription_id: subscription.id,
        scheduled_for: scheduledFor,
        status: RenewalCycleStatus.SCHEDULED,
        metadata: {
          settings_policy: {
            default_renewal_behavior: createTimeBehavior,
            settings_version: settings.version,
            is_persisted: settings.is_persisted,
          },
        },
        ...approvalState,
      } as any)

      return new StepResponse<
        EnsureNextRenewalCycleStepOutput,
        EnsureNextRenewalCycleCompensation
      >(
        {
          action: "created",
          subscription_id: subscription.id,
          renewal_cycle_id: created.id,
        },
        {
          action: "created",
          renewal_cycle_id: created.id,
        }
      )
    }

    const existingBehavior =
      (
        existingCycle.metadata?.settings_policy as
          | {
              default_renewal_behavior?: SubscriptionRenewalBehavior
            }
          | undefined
      )?.default_renewal_behavior ??
      (settings.is_persisted
        ? settings.default_renewal_behavior
        : SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES)

    const approvalState = deriveUpcomingRenewalApprovalState(
      subscription,
      scheduledFor,
      existingBehavior
    )

    if (
      existingCycle.status === RenewalCycleStatus.PROCESSING ||
      existingCycle.status === RenewalCycleStatus.SUCCEEDED
    ) {
      return new StepResponse<
        EnsureNextRenewalCycleStepOutput,
        EnsureNextRenewalCycleCompensation
      >(
        {
          action: "noop",
          subscription_id: subscription.id,
          renewal_cycle_id: existingCycle.id,
        }
      )
    }

    if (
      existingCycle.approval_required === approvalState.approval_required &&
      existingCycle.approval_status === approvalState.approval_status &&
      existingCycle.approval_decided_at === approvalState.approval_decided_at &&
      existingCycle.approval_decided_by === approvalState.approval_decided_by &&
      existingCycle.approval_reason === approvalState.approval_reason
    ) {
      return new StepResponse<
        EnsureNextRenewalCycleStepOutput,
        EnsureNextRenewalCycleCompensation
      >(
        {
          action: "noop",
          subscription_id: subscription.id,
          renewal_cycle_id: existingCycle.id,
        }
      )
    }

    const updated = await renewalModule.updateRenewalCycles({
      id: existingCycle.id,
      ...approvalState,
      metadata: {
        ...(existingCycle.metadata ?? {}),
        settings_policy: {
          default_renewal_behavior: existingBehavior,
          settings_version:
            (
              existingCycle.metadata?.settings_policy as
                | {
                    settings_version?: number
                  }
                | undefined
            )?.settings_version ?? settings.version,
          is_persisted:
            (
              existingCycle.metadata?.settings_policy as
                | {
                    is_persisted?: boolean
                  }
                | undefined
            )?.is_persisted ?? settings.is_persisted,
        },
      },
    } as any)

    return new StepResponse<
      EnsureNextRenewalCycleStepOutput,
      EnsureNextRenewalCycleCompensation
    >(
      {
        action: "updated",
        subscription_id: subscription.id,
        renewal_cycle_id: updated.id,
      },
      {
        action: "updated",
        previous: {
          id: existingCycle.id,
          approval_required: existingCycle.approval_required,
          approval_status: existingCycle.approval_status,
          approval_decided_at: existingCycle.approval_decided_at,
          approval_decided_by: existingCycle.approval_decided_by,
          approval_reason: existingCycle.approval_reason,
        },
      }
    )
  },
  async function (
    compensation: EnsureNextRenewalCycleCompensation,
    { container }
  ) {
    if (!compensation) {
      return
    }

    const renewalModule = container.resolve<RenewalModuleService>(RENEWAL_MODULE)

    if (compensation.action === "created") {
      await renewalModule.deleteRenewalCycles(compensation.renewal_cycle_id)
      return
    }

    if (compensation.action === "deleted") {
      for (const cycle of compensation.previous) {
        await renewalModule.createRenewalCycles(cycle as any)
      }

      return
    }

    await renewalModule.updateRenewalCycles(compensation.previous as any)
  }
)
