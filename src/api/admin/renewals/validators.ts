import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"

const optionalIsoDateTime = z.string().datetime().optional()

const renewalCycleStatusSchema = z.enum([
  "scheduled",
  "processing",
  "succeeded",
  "failed",
])

const renewalApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
])

const renewalAttemptStatusSchema = z.enum([
  "processing",
  "succeeded",
  "failed",
])

export const GetAdminRenewalsSchema = createFindParams({
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
  }, z.array(renewalCycleStatusSchema).optional()),
  approval_status: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(renewalApprovalStatusSchema).optional()),
  scheduled_from: optionalIsoDateTime,
  scheduled_to: optionalIsoDateTime,
  last_attempt_status: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(renewalAttemptStatusSchema).optional()),
  subscription_id: z.string().optional(),
  generated_order_id: z.string().optional(),
})

export type GetAdminRenewalsSchemaType = z.infer<
  typeof GetAdminRenewalsSchema
>

export const GetAdminRenewalSchema = createFindParams().extend({})

export type GetAdminRenewalSchemaType = z.infer<
  typeof GetAdminRenewalSchema
>

export const PostAdminForceRenewalSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

export type PostAdminForceRenewalSchemaType = z.infer<
  typeof PostAdminForceRenewalSchema
>
