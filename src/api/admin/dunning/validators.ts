import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"

const optionalIsoDateTime = z.string().datetime().optional()

const dunningCaseStatusSchema = z.enum([
  "open",
  "retry_scheduled",
  "retrying",
  "awaiting_manual_resolution",
  "recovered",
  "unrecovered",
])

const dunningAttemptStatusSchema = z.enum([
  "processing",
  "succeeded",
  "failed",
])

export const GetAdminDunningCasesSchema = createFindParams({
  offset: 0,
  limit: 20,
}).extend({
  q: z.string().optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  status: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(dunningCaseStatusSchema).optional()),
  subscription_id: z.string().optional(),
  renewal_cycle_id: z.string().optional(),
  renewal_order_id: z.string().optional(),
  payment_provider_id: z.string().trim().min(1).optional(),
  last_payment_error_code: z.string().trim().min(1).optional(),
  attempt_count_min: z.coerce.number().int().min(0).optional(),
  attempt_count_max: z.coerce.number().int().min(0).optional(),
  next_retry_from: optionalIsoDateTime,
  next_retry_to: optionalIsoDateTime,
  last_attempt_status: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(dunningAttemptStatusSchema).optional()),
}).superRefine((value, ctx) => {
  if (
    typeof value.attempt_count_min === "number" &&
    typeof value.attempt_count_max === "number" &&
    value.attempt_count_min > value.attempt_count_max
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attempt_count_max"],
      message: "attempt_count_max must be greater than or equal to attempt_count_min",
    })
  }
})

export type GetAdminDunningCasesSchemaType = z.infer<
  typeof GetAdminDunningCasesSchema
>

export const GetAdminDunningCaseSchema = createFindParams().extend({})

export type GetAdminDunningCaseSchemaType = z.infer<
  typeof GetAdminDunningCaseSchema
>

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
}).superRefine((value, ctx) => {
  if (value.intervals.length !== value.max_attempts) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["max_attempts"],
      message: "max_attempts must equal the number of retry intervals",
    })
  }
})

export type PostAdminDunningRetryScheduleSchemaType = z.infer<
  typeof PostAdminDunningRetryScheduleSchema
>
