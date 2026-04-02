import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  createAnalyticsCorrelationId,
  getAnalyticsErrorMessage,
} from "../../../../modules/analytics/utils/observability"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "../../../../workflows"
import type { PostAdminSubscriptionAnalyticsRebuildSchemaType } from "../validators"

const MAX_REBUILD_WINDOW_DAYS = 365

function toUtcDayStart(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function getInclusiveDayWindowSize(dateFrom: Date, dateTo: Date) {
  const from = toUtcDayStart(dateFrom).getTime()
  const to = toUtcDayStart(dateTo).getTime()

  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1
}

function mapManualRebuildError(error: unknown) {
  const message = getAnalyticsErrorMessage(error)
  const lowered = message.toLowerCase()

  if (
    lowered.includes("must be a valid date") ||
    lowered.includes("must be less than or equal") ||
    lowered.includes("can't exceed")
  ) {
    return {
      status: 400,
      type: "invalid_data",
      message,
    }
  }

  return {
    status: 500,
    type: "unknown_error",
    message,
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSubscriptionAnalyticsRebuildSchemaType>,
  res: MedusaResponse
) => {
  const parsedFrom = new Date(req.validatedBody.date_from)
  const parsedTo = new Date(req.validatedBody.date_to)
  const requestedDays = getInclusiveDayWindowSize(parsedFrom, parsedTo)

  if (requestedDays > MAX_REBUILD_WINDOW_DAYS) {
    return res.status(400).json({
      type: "invalid_data",
      message: `Analytics rebuild window can't exceed ${MAX_REBUILD_WINDOW_DAYS} days`,
    })
  }

  try {
    const { result } = await rebuildAnalyticsDailySnapshotsWorkflow(req.scope).run({
      input: {
        date_from: parsedFrom,
        date_to: parsedTo,
        trigger_type: "manual",
        triggered_by: req.auth_context.actor_id,
        reason: req.validatedBody.reason ?? "manual_admin_rebuild",
        correlation_id: createAnalyticsCorrelationId("analytics-manual-rebuild"),
      },
    })

    return res.status(200).json({
      rebuild: {
        ...result,
        requested_days: requestedDays,
        outcome:
          result.failed_days.length > 0
            ? "partial_failure"
            : result.blocked_days.length > 0
              ? "partial_blocked"
              : "completed",
      },
    })
  } catch (error) {
    const mapped = mapManualRebuildError(error)

    return res.status(mapped.status).json({
      type: mapped.type,
      message: mapped.message,
    })
  }
}
