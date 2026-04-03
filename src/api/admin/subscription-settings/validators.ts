import { z } from "zod"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../../../modules/settings/types"

function validateSettingsBody(
  value: {
    default_trial_days?: number
    dunning_retry_intervals?: number[]
    max_dunning_attempts?: number
  },
  ctx: z.RefinementCtx
) {
  const intervals = value.dunning_retry_intervals

  if (intervals) {
    if (!intervals.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'dunning_retry_intervals' must contain at least one interval",
        path: ["dunning_retry_intervals"],
      })
    }

    const seen = new Set<number>()

    intervals.forEach((interval, index) => {
      if (!Number.isInteger(interval)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each retry interval must be an integer",
          path: ["dunning_retry_intervals", index],
        })
      }

      if (interval <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each retry interval must be greater than 0",
          path: ["dunning_retry_intervals", index],
        })
      }

      if (seen.has(interval)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Retry intervals must not contain duplicates",
          path: ["dunning_retry_intervals", index],
        })
      }

      seen.add(interval)

      if (index > 0 && interval <= intervals[index - 1]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Retry intervals must be strictly increasing",
          path: ["dunning_retry_intervals", index],
        })
      }
    })
  }

  if (
    value.max_dunning_attempts !== undefined &&
    intervals !== undefined &&
    value.max_dunning_attempts !== intervals.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "'max_dunning_attempts' must match the number of 'dunning_retry_intervals'",
      path: ["max_dunning_attempts"],
    })
  }
}

export const PostAdminSubscriptionSettingsSchema = z
  .object({
    default_trial_days: z.number().int().min(0).optional(),
    dunning_retry_intervals: z.array(z.number().int()).optional(),
    max_dunning_attempts: z.number().int().gt(0).optional(),
    default_renewal_behavior: z
      .nativeEnum(SubscriptionRenewalBehavior)
      .optional(),
    default_cancellation_behavior: z
      .nativeEnum(SubscriptionCancellationBehavior)
      .optional(),
    expected_version: z.number().int().min(0).default(0),
    reason: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine(validateSettingsBody)

export type PostAdminSubscriptionSettingsSchemaType = z.infer<
  typeof PostAdminSubscriptionSettingsSchema
>
