import { z } from "zod"

export const PostAdminSubscriptionAnalyticsRebuildSchema = z.object({
  date_from: z.string().datetime(),
  date_to: z.string().datetime(),
  reason: z.string().trim().min(1).max(255).optional(),
})

export type PostAdminSubscriptionAnalyticsRebuildSchemaType = z.infer<
  typeof PostAdminSubscriptionAnalyticsRebuildSchema
>
