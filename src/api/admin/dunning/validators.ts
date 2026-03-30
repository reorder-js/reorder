import { z } from "zod"

export const PostAdminRetryNowDunningSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

export type PostAdminRetryNowDunningSchemaType = z.infer<
  typeof PostAdminRetryNowDunningSchema
>

export const PostAdminMarkRecoveredDunningSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

export type PostAdminMarkRecoveredDunningSchemaType = z.infer<
  typeof PostAdminMarkRecoveredDunningSchema
>

export const PostAdminMarkUnrecoveredDunningSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})

export type PostAdminMarkUnrecoveredDunningSchemaType = z.infer<
  typeof PostAdminMarkUnrecoveredDunningSchema
>

export const PostAdminDunningRetryScheduleSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  intervals: z.array(z.number().int().positive()).min(1).max(12),
  max_attempts: z.number().int().positive().max(12),
})

export type PostAdminDunningRetryScheduleSchemaType = z.infer<
  typeof PostAdminDunningRetryScheduleSchema
>
