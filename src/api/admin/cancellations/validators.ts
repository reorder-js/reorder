import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"

const optionalIsoDateTime = z.string().datetime().optional()

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

const cancellationReasonCategorySchema = z.enum([
  "price",
  "product_fit",
  "delivery",
  "billing",
  "temporary_pause",
  "switched_competitor",
  "other",
])

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
