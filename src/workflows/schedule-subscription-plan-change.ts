import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  scheduleSubscriptionPlanChangeStep,
  ScheduleSubscriptionPlanChangeStepInput,
} from "./steps/schedule-subscription-plan-change"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"

export const scheduleSubscriptionPlanChangeWorkflow = createWorkflow(
  "schedule-subscription-plan-change",
  function (input: ScheduleSubscriptionPlanChangeStepInput) {
    const subscriptionChange = scheduleSubscriptionPlanChangeStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
            actor_type: ActivityLogActorType.USER,
            actor_id: input.requested_by ?? null,
            display: {
              subscription_reference: subscriptionChange.current.reference,
              customer_name:
                subscriptionChange.current.customer_snapshot?.full_name ?? null,
              product_title:
                subscriptionChange.current.product_snapshot?.product_title ?? null,
              variant_title:
                subscriptionChange.current.product_snapshot?.variant_title ?? null,
            },
            previous_state: {
              pending_update_data: subscriptionChange.previous.pending_update_data,
            },
            new_state: {
              pending_update_data: subscriptionChange.current.pending_update_data,
            },
            metadata: {
              source: "admin",
              effective_at:
                subscriptionChange.current.pending_update_data?.effective_at ?? null,
            },
            dedupe: {
              scope: "subscription",
              target_id: subscriptionChange.current.id,
              qualifier:
                subscriptionChange.current.pending_update_data?.requested_at ?? null,
            },
          }),
        }
      }
    )
    createSubscriptionLogEventStep(logInput)
    const ensureInput = transform({ subscriptionChange }, function ({ subscriptionChange }) {
      return {
        subscription_id: subscriptionChange.current.id,
      }
    })

    const renewal_cycle = ensureNextRenewalCycleStep(ensureInput)

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
      renewal_cycle,
    })
  }
)

export default scheduleSubscriptionPlanChangeWorkflow
