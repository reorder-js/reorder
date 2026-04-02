import { z } from "zod"
import { AnalyticsGroupBy } from "../../../admin/types/analytics"

const optionalIsoDateTime = z.string().datetime().optional()

const stringArrayFilter = z.preprocess((value) => {
  if (typeof value === "string") {
    return [value]
  }

  return value
}, z.array(z.string()).optional())

export const GetAdminSubscriptionAnalyticsKpisSchema = z.object({
  date_from: optionalIsoDateTime,
  date_to: optionalIsoDateTime,
  status: stringArrayFilter,
  product_id: stringArrayFilter,
  frequency: stringArrayFilter,
  group_by: z.nativeEnum(AnalyticsGroupBy).optional(),
})

export type GetAdminSubscriptionAnalyticsKpisSchemaType = z.infer<
  typeof GetAdminSubscriptionAnalyticsKpisSchema
>

export const GetAdminSubscriptionAnalyticsTrendsSchema =
  GetAdminSubscriptionAnalyticsKpisSchema

export type GetAdminSubscriptionAnalyticsTrendsSchemaType = z.infer<
  typeof GetAdminSubscriptionAnalyticsTrendsSchema
>

export const GetAdminSubscriptionAnalyticsExportSchema =
  GetAdminSubscriptionAnalyticsKpisSchema.extend({
    format: z.enum(["csv", "json"]).optional(),
  })

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
