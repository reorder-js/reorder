import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { toISOStringOrNull } from "./utils/date-output"
import {
  rejectRenewalChangesStep,
  type RejectRenewalChangesStepInput,
} from "./steps/reject-renewal-changes"

export const rejectRenewalChangesWorkflow = createWorkflow(
  "reject-renewal-changes",
  function (input: RejectRenewalChangesStepInput) {
    const approvalChange = rejectRenewalChangesStep(input)
    const logInput = transform(
      { approvalChange, input },
      function ({ approvalChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: approvalChange.current.subscription_id,
            customer_id: approvalChange.subscription.customer_id,
            event_type: ActivityLogEventType.RENEWAL_APPROVAL_REJECTED,
            actor_type: ActivityLogActorType.USER,
            actor_id: input.decided_by ?? null,
            display: {
              subscription_reference: approvalChange.subscription.reference,
              customer_name:
                approvalChange.subscription.customer_snapshot?.full_name ?? null,
              product_title:
                approvalChange.subscription.product_snapshot?.product_title ?? null,
              variant_title:
                approvalChange.subscription.product_snapshot?.variant_title ?? null,
            },
            previous_state: {
              approval_status: approvalChange.previous.approval_status,
              approval_decided_at: toISOStringOrNull(
                approvalChange.previous.approval_decided_at
              ),
              approval_decided_by: approvalChange.previous.approval_decided_by,
              approval_reason: approvalChange.previous.approval_reason,
            },
            new_state: {
              approval_status: approvalChange.current.approval_status,
              approval_decided_at: toISOStringOrNull(
                approvalChange.current.approval_decided_at
              ),
              approval_decided_by: approvalChange.current.approval_decided_by,
              approval_reason: approvalChange.current.approval_reason,
            },
            reason: approvalChange.current.approval_reason ?? null,
            metadata: {
              source: "admin",
              renewal_cycle_id: approvalChange.current.id,
              approval_status: approvalChange.current.approval_status,
            },
            dedupe: {
              scope: "renewal",
              target_id: approvalChange.current.id,
              qualifier: toISOStringOrNull(
                approvalChange.current.approval_decided_at
              ),
            },
          }),
        }
      }
    )
    createSubscriptionLogEventStep(logInput)
    const renewal_cycle = transform({ approvalChange }, function ({ approvalChange }) {
      return approvalChange.current
    })

    return new WorkflowResponse({
      renewal_cycle,
    })
  }
)

export default rejectRenewalChangesWorkflow
