import { z } from "zod"
import { AnalyticsGroupBy } from "../../../admin/types/analytics"

const optionalIsoDateTime = z.string().datetime().optional()
const MAX_ANALYTICS_WINDOW_DAYS = 731

const stringArrayFilter = z.preprocess((value) => {
  if (typeof value === "string") {
    return [value]
  }

  return value
}, z.array(z.string()).optional())

const analyticsSubscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "cancelled",
  "past_due",
])

const statusArrayFilter = z.preprocess((value) => {
  if (typeof value === "string") {
    return [value]
  }

  return value
}, z.array(analyticsSubscriptionStatusSchema).optional())

const frequencyArrayFilter = z.preprocess((value) => {
  if (typeof value === "string") {
    return [value]
  }

  return value
}, z.array(z.string().regex(/^(week|month|year):[1-9]\d*$/)).optional())

function validateDateWindow(
  value: { date_from?: string; date_to?: string },
  ctx: z.RefinementCtx
) {
  if (!value.date_from || !value.date_to) {
    return
  }

  const dateFrom = new Date(value.date_from)
  const dateTo = new Date(value.date_to)

  if (dateFrom.getTime() > dateTo.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "'date_from' must be less than or equal to 'date_to'",
      path: ["date_from"],
    })
    return
  }

  const dayDiff =
    Math.floor((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1

  if (dayDiff > MAX_ANALYTICS_WINDOW_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Analytics query window can't exceed ${MAX_ANALYTICS_WINDOW_DAYS} days`,
      path: ["date_to"],
    })
  }
}

const analyticsBaseQuerySchemaObject = z.object({
  date_from: optionalIsoDateTime,
  date_to: optionalIsoDateTime,
  status: statusArrayFilter,
  product_id: stringArrayFilter,
  frequency: frequencyArrayFilter,
  group_by: z.nativeEnum(AnalyticsGroupBy).default(AnalyticsGroupBy.DAY),
  timezone: z.literal("UTC").default("UTC"),
})

export const GetAdminSubscriptionAnalyticsKpisSchema =
  analyticsBaseQuerySchemaObject.superRefine(validateDateWindow)

export type GetAdminSubscriptionAnalyticsKpisSchemaType = z.infer<
  typeof GetAdminSubscriptionAnalyticsKpisSchema
>

export const GetAdminSubscriptionAnalyticsTrendsSchema =
  analyticsBaseQuerySchemaObject.superRefine(validateDateWindow)

export type GetAdminSubscriptionAnalyticsTrendsSchemaType = z.infer<
  typeof GetAdminSubscriptionAnalyticsTrendsSchema
>

export const GetAdminSubscriptionAnalyticsExportSchema =
  analyticsBaseQuerySchemaObject
    .extend({
      format: z.enum(["csv", "json"]).optional(),
    })
    .superRefine(validateDateWindow)

export type GetAdminSubscriptionAnalyticsExportSchemaType = z.infer<
  typeof GetAdminSubscriptionAnalyticsExportSchema
>

export const PostAdminSubscriptionAnalyticsRebuildSchema = z.object({
  date_from: z.string().datetime(),
  date_to: z.string().datetime(),
  reason: z.string().trim().min(1).max(255).optional(),
})

export type PostAdminSubscriptionAnalyticsRebuildSchemaType = z.infer<
  typeof PostAdminSubscriptionAnalyticsRebuildSchema
>
