import {
  createHook,
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "./rebuild-analytics-daily-snapshots"
import {
  authorizeRenewalPaymentStep,
  createRenewalOrderStep,
  finalizeRenewalCycleStep,
  prepareRenewalCycleStep,
  ProcessRenewalCycleStepInput,
} from "./steps/process-renewal-cycle"
import { buildAnalyticsIncrementalRebuildInput } from "./utils/analytics-incremental"

export const setPaymentSessionDataResult = z
  .record(z.string(), z.unknown())
  .optional()

export const processRenewalCycleWorkflow = createWorkflow(
  "process-renewal-cycle",
  function (input: ProcessRenewalCycleStepInput) {
    const lockKey = transform({ input }, function ({ input }) {
      return `renewal:${input.renewal_cycle_id}`
    })

    acquireLockStep({
      key: lockKey,
      timeout: 10,
      ttl: 120,
    })

    const context = prepareRenewalCycleStep(input)
    const orderResult = createRenewalOrderStep(context)

    const setPaymentSessionData = createHook(
      "setPaymentSessionData",
      {
        payment_collections: orderResult.payment_collections,
        subscription: context.subscription,
        order: orderResult.order,
      },
      {
        resultValidator: setPaymentSessionDataResult,
      }
    )
    const paymentSessionData = setPaymentSessionData.getResult()

    authorizeRenewalPaymentStep({
      context,
      order_result: orderResult,
      payment_session_data: paymentSessionData,
    })

    const result = finalizeRenewalCycleStep({
      context,
      order_result: orderResult,
    })

    const ensureInput = transform({ result }, function ({ result }) {
      return {
        subscription_id: result.subscription_id,
      }
    })

    ensureNextRenewalCycleStep(ensureInput)

    const incrementalAnalyticsInput = transform({ input }, function ({ input }) {
      return buildAnalyticsIncrementalRebuildInput({
        occurred_at: new Date(),
        trigger_source: "renewal_processed",
        correlation_id: input.correlation_id ?? null,
        triggered_by: input.triggered_by ?? null,
      })
    })
    rebuildAnalyticsDailySnapshotsWorkflow.runAsStep({
      input: incrementalAnalyticsInput,
    })

    releaseLockStep({
      key: lockKey,
    })

    return new WorkflowResponse(result, {
      hooks: [setPaymentSessionData],
    })
  }
)

export default processRenewalCycleWorkflow
