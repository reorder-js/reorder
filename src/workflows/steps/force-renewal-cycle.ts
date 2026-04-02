import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RENEWAL_MODULE } from "../../modules/renewal"
import RenewalModuleService from "../../modules/renewal/service"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import SubscriptionModuleService from "../../modules/subscription/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../modules/renewal/types"
import { renewalErrors } from "../../modules/renewal/utils/errors"
import {
  classifyRenewalFailure,
  createRenewalCorrelationId,
  getRenewalErrorMessage,
  isAlertableRenewalFailure,
  logRenewalEvent,
} from "../../modules/renewal/utils/observability"
import { normalizeActivityLogEvent } from "../../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../../modules/activity-log/types"
import { processRenewalCycleWorkflow } from "../process-renewal-cycle"
import { persistSubscriptionLogEvent } from "./create-subscription-log-event"

export type ForceRenewalCycleStepInput = {
  renewal_cycle_id: string
  triggered_by?: string | null
  reason?: string | null
  correlation_id?: string | null
}

type ForceRenewalSubscriptionDisplayRecord = {
  reference: string
  customer_id: string
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
}

export const forceRenewalCycleStep = createStep(
  "force-renewal-cycle",
  async function (input: ForceRenewalCycleStepInput, { container }) {
    const logger = container.resolve("logger")
    const renewalModule =
      container.resolve(RENEWAL_MODULE) as RenewalModuleService
    const subscriptionModule =
      container.resolve(SUBSCRIPTION_MODULE) as SubscriptionModuleService
    const correlationId =
      input.correlation_id ?? createRenewalCorrelationId("renewal-force")

    let cycle: Awaited<ReturnType<RenewalModuleService["retrieveRenewalCycle"]>>

    try {
      cycle = await renewalModule.retrieveRenewalCycle(input.renewal_cycle_id)
    } catch {
      throw renewalErrors.notFound("RenewalCycle", input.renewal_cycle_id)
    }
    const subscription = (await subscriptionModule.retrieveSubscription(
      cycle.subscription_id
    )) as unknown as ForceRenewalSubscriptionDisplayRecord

    logRenewalEvent(logger, "info", {
      event: "renewal.force",
      outcome: "started",
      correlation_id: correlationId,
      renewal_cycle_id: cycle.id,
      subscription_id: cycle.subscription_id,
      trigger_type: "manual",
      triggered_by: input.triggered_by ?? null,
    })

    try {
      if (cycle.status === RenewalCycleStatus.PROCESSING) {
        throw renewalErrors.alreadyProcessing(cycle.id)
      }

      if (cycle.status === RenewalCycleStatus.SUCCEEDED) {
        throw renewalErrors.duplicateExecutionBlocked(cycle.id)
      }

      if (
        cycle.status !== RenewalCycleStatus.SCHEDULED &&
        cycle.status !== RenewalCycleStatus.FAILED
      ) {
        throw renewalErrors.invalidTransition(
          cycle.id,
          `Renewal '${cycle.id}' can only be force-run from 'scheduled' or 'failed' state`
        )
      }

      if (
        cycle.approval_required &&
        cycle.approval_status !== RenewalApprovalStatus.APPROVED
      ) {
        throw renewalErrors.invalidTransition(
          cycle.id,
          `Renewal '${cycle.id}' requires approved changes before it can be force-run`
        )
      }

      await persistSubscriptionLogEvent(container, normalizeActivityLogEvent({
        subscription_id: cycle.subscription_id,
        customer_id: subscription.customer_id ?? null,
        event_type: ActivityLogEventType.RENEWAL_FORCE_REQUESTED,
        actor_type: ActivityLogActorType.USER,
        actor_id: input.triggered_by ?? null,
        display: {
          subscription_reference: subscription.reference,
          customer_name: subscription.customer_snapshot?.full_name ?? null,
          product_title: subscription.product_snapshot?.product_title ?? null,
          variant_title: subscription.product_snapshot?.variant_title ?? null,
        },
        reason: input.reason ?? null,
        metadata: {
          source: "admin",
          renewal_cycle_id: cycle.id,
          trigger_type: "manual",
        },
        correlation_id: correlationId,
        dedupe: {
          scope: "renewal",
          target_id: cycle.id,
          qualifier: correlationId,
        },
      }))

      await processRenewalCycleWorkflow(container).run({
        input: {
          renewal_cycle_id: cycle.id,
          trigger_type: "manual",
          triggered_by: input.triggered_by ?? null,
          reason: input.reason ?? null,
          correlation_id: correlationId,
        },
      })
    } catch (error) {
      const failureKind = classifyRenewalFailure(error)
      const level =
        failureKind === "already_processing" || failureKind === "duplicate_execution"
          ? "warn"
          : "error"

      logRenewalEvent(logger, level, {
        event: "renewal.force",
        outcome:
          failureKind === "already_processing" || failureKind === "duplicate_execution"
            ? "blocked"
            : "failed",
        correlation_id: correlationId,
        renewal_cycle_id: cycle.id,
        subscription_id: cycle.subscription_id,
        trigger_type: "manual",
        triggered_by: input.triggered_by ?? null,
        failure_kind: failureKind,
        alertable: isAlertableRenewalFailure(failureKind),
        message: getRenewalErrorMessage(error),
      })

      throw error
    }

    logRenewalEvent(logger, "info", {
      event: "renewal.force",
      outcome: "succeeded",
      correlation_id: correlationId,
      renewal_cycle_id: cycle.id,
      subscription_id: cycle.subscription_id,
      trigger_type: "manual",
      triggered_by: input.triggered_by ?? null,
      success_count: 1,
      failure_count: 0,
    })

    return new StepResponse(cycle.id)
  }
)
