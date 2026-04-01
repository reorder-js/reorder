import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"
import {
  CancellationReasonCategory,
  RetentionOfferType,
} from "../../../modules/cancellation/types"

const optionalIsoDateTime = z.string().datetime().optional()
const metadataSchema = z.record(z.string(), z.unknown()).optional()
const positiveIntOrNullSchema = z.number().int().positive().nullable()
const nonNegativeNumberOrNullSchema = z.number().nonnegative().nullable()

const cancellationCaseStatusSchema = z.enum([
  "requested",
  "evaluating_retention",
  "retention_offered",
  "retained",
  "paused",
  "canceled",
])

const cancellationFinalOutcomeSchema = z.enum([
  "retained",
  "paused",
  "canceled",
])

const cancellationReasonCategorySchema = z.nativeEnum(
  CancellationReasonCategory
)

export const GetAdminCancellationsSchema = createFindParams({
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
  }, z.array(cancellationCaseStatusSchema).optional()),
  final_outcome: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }
    return value
  }, z.array(cancellationFinalOutcomeSchema).optional()),
  reason_category: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }
    return value
  }, z.array(cancellationReasonCategorySchema).optional()),
  subscription_id: z.string().optional(),
  created_from: optionalIsoDateTime,
  created_to: optionalIsoDateTime,
})

export type GetAdminCancellationsSchemaType = z.infer<
  typeof GetAdminCancellationsSchema
>

export const GetAdminCancellationSchema = createFindParams().extend({})

export type GetAdminCancellationSchemaType = z.infer<
  typeof GetAdminCancellationSchema
>

const pauseOfferPayloadSchema = z.object({
  pause_offer: z.object({
    pause_cycles: positiveIntOrNullSchema,
    resume_at: z.string().datetime().nullable(),
    note: z.string().nullable(),
  }).refine(
    (value) => value.pause_cycles !== null || value.resume_at !== null,
    {
      message: "Pause offer requires pause_cycles or resume_at",
    }
  ),
})

const discountOfferPayloadSchema = z.object({
  discount_offer: z.object({
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.number().positive(),
    duration_cycles: positiveIntOrNullSchema,
    note: z.string().nullable(),
  }).superRefine((value, ctx) => {
    if (value.discount_type === "percentage" && value.discount_value > 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage discount can't exceed 50",
        path: ["discount_value"],
      })
    }
  }),
})

const bonusOfferPayloadSchema = z.object({
  bonus_offer: z.object({
    bonus_type: z.enum(["free_cycle", "gift", "credit"]),
    value: nonNegativeNumberOrNullSchema,
    label: z.string().nullable(),
    duration_cycles: positiveIntOrNullSchema,
    note: z.string().nullable(),
  }).superRefine((value, ctx) => {
    if (
      (value.bonus_type === "free_cycle" || value.bonus_type === "credit") &&
      value.value === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus offer requires value for free_cycle or credit",
        path: ["value"],
      })
    }
  }),
})

export const PostAdminSmartCancelSchema = z.object({
  evaluated_by: z.string().optional(),
  metadata: metadataSchema,
})

export type PostAdminSmartCancelSchemaType = z.infer<
  typeof PostAdminSmartCancelSchema
>

export const PostAdminApplyRetentionOfferSchema = z.object({
  offer_type: z.nativeEnum(RetentionOfferType),
  offer_payload: z.union([
    pauseOfferPayloadSchema,
    discountOfferPayloadSchema,
    bonusOfferPayloadSchema,
  ]),
  decided_by: z.string().optional(),
  decision_reason: z.string().optional(),
  metadata: metadataSchema,
})

export type PostAdminApplyRetentionOfferSchemaType = z.infer<
  typeof PostAdminApplyRetentionOfferSchema
>

export const PostAdminFinalizeCancellationSchema = z.object({
  reason: z.string().optional(),
  reason_category: cancellationReasonCategorySchema.optional(),
  notes: z.string().optional(),
  finalized_by: z.string().optional(),
  effective_at: z.enum(["immediately", "end_of_cycle"]).optional(),
  metadata: metadataSchema,
})

export type PostAdminFinalizeCancellationSchemaType = z.infer<
  typeof PostAdminFinalizeCancellationSchema
>

export const PostAdminUpdateCancellationReasonSchema = z.object({
  reason: z.string(),
  reason_category: cancellationReasonCategorySchema.optional(),
  notes: z.string().optional(),
  updated_by: z.string().optional(),
  update_reason: z.string().optional(),
  metadata: metadataSchema,
})

export type PostAdminUpdateCancellationReasonSchemaType = z.infer<
  typeof PostAdminUpdateCancellationReasonSchema
>
