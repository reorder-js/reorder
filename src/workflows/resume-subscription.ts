import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  resumeSubscriptionStep,
  ResumeSubscriptionStepInput,
} from "./steps/resume-subscription"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "./rebuild-analytics-daily-snapshots"
import { toISOStringOrNull } from "./utils/date-output"
import { buildAnalyticsIncrementalRebuildInput } from "./utils/analytics-incremental"

export const resumeSubscriptionWorkflow = createWorkflow(
  "resume-subscription",
  function (input: ResumeSubscriptionStepInput) {
    const subscriptionChange = resumeSubscriptionStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_RESUMED,
            actor_type: ActivityLogActorType.USER,
            actor_id: input.triggered_by ?? null,
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
              status: subscriptionChange.previous.status,
              paused_at: toISOStringOrNull(subscriptionChange.previous.paused_at),
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.previous.next_renewal_at
              ),
            },
            new_state: {
              status: subscriptionChange.current.status,
              paused_at: toISOStringOrNull(subscriptionChange.current.paused_at),
              next_renewal_at: toISOStringOrNull(
                subscriptionChange.current.next_renewal_at
              ),
            },
            metadata: {
              source: "admin",
              effective_at: toISOStringOrNull(
                subscriptionChange.current.next_renewal_at
              ),
            },
            dedupe: {
              scope: "subscription",
              target_id: subscriptionChange.current.id,
              qualifier:
                toISOStringOrNull(subscriptionChange.current.next_renewal_at) ??
                "resume",
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
    const incrementalAnalyticsInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return buildAnalyticsIncrementalRebuildInput({
          occurred_at: new Date(),
          trigger_source: "resume_subscription",
          correlation_id: null,
          triggered_by: input.triggered_by ?? null,
        })
      }
    )
    rebuildAnalyticsDailySnapshotsWorkflow.runAsStep({
      input: incrementalAnalyticsInput,
    })

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
      renewal_cycle,
    })
  }
)

export default resumeSubscriptionWorkflow
