import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  normalizeAnalyticsRebuildRangeStep,
  RebuildAnalyticsDailySnapshotsStepInput,
  RebuildAnalyticsDailySnapshotsStepOutput,
} from "./steps/normalize-analytics-rebuild-range"
import { rebuildAnalyticsDailySnapshotsStep } from "./steps/rebuild-analytics-daily-snapshots"

export type RebuildAnalyticsDailySnapshotsWorkflowInput =
  RebuildAnalyticsDailySnapshotsStepInput

export type RebuildAnalyticsDailySnapshotsWorkflowOutput =
  RebuildAnalyticsDailySnapshotsStepOutput

export const rebuildAnalyticsDailySnapshotsWorkflow = createWorkflow(
  "rebuild-analytics-daily-snapshots",
  function (input: RebuildAnalyticsDailySnapshotsWorkflowInput) {
    const normalized = normalizeAnalyticsRebuildRangeStep(input)
    const result = rebuildAnalyticsDailySnapshotsStep(normalized)

    return new WorkflowResponse(result)
  }
)

export default rebuildAnalyticsDailySnapshotsWorkflow
