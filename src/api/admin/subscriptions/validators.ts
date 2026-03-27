import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"

const stringToBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    if (value === "true") {
      return true
    }

    if (value === "false") {
      return false
    }
  }

  return value
}, z.boolean())

const optionalIsoDateTime = z.string().datetime().optional()

const subscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "cancelled",
  "past_due",
])

const subscriptionFrequencyIntervalSchema = z.enum(["week", "month", "year"])

export const GetAdminSubscriptionsSchema = createFindParams({
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
  }, z.array(subscriptionStatusSchema).optional()),
  customer_id: z.string().optional(),
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  next_renewal_from: optionalIsoDateTime,
  next_renewal_to: optionalIsoDateTime,
  is_trial: stringToBoolean.optional(),
  skip_next_cycle: stringToBoolean.optional(),
})

export type GetAdminSubscriptionsSchemaType = z.infer<
  typeof GetAdminSubscriptionsSchema
>

export const GetAdminSubscriptionSchema = createFindParams().extend({})

export type GetAdminSubscriptionSchemaType = z.infer<
  typeof GetAdminSubscriptionSchema
>

export const PostAdminPauseSubscriptionSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  effective_at: z.string().datetime().optional(),
})

export type PostAdminPauseSubscriptionSchemaType = z.infer<
  typeof PostAdminPauseSubscriptionSchema
>

export const PostAdminResumeSubscriptionSchema = z.object({
  resume_at: z.string().datetime().optional(),
  preserve_billing_anchor: z.boolean().optional(),
})

export type PostAdminResumeSubscriptionSchemaType = z.infer<
  typeof PostAdminResumeSubscriptionSchema
>

export const PostAdminCancelSubscriptionSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  effective_at: z.enum(["immediately", "end_of_cycle"]).optional(),
})

export type PostAdminCancelSubscriptionSchemaType = z.infer<
  typeof PostAdminCancelSubscriptionSchema
>

export const PostAdminScheduleSubscriptionPlanChangeSchema = z.object({
  variant_id: z.string().min(1),
  frequency_interval: subscriptionFrequencyIntervalSchema,
  frequency_value: z.number().int().positive(),
  effective_at: z.string().datetime().optional(),
})

export type PostAdminScheduleSubscriptionPlanChangeSchemaType = z.infer<
  typeof PostAdminScheduleSubscriptionPlanChangeSchema
>

export const PostAdminUpdateSubscriptionShippingAddressSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  company: z.string().trim().optional().nullable(),
  address_1: z.string().trim().min(1),
  address_2: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1),
  postal_code: z.string().trim().min(1),
  province: z.string().trim().optional().nullable(),
  country_code: z.string().trim().length(2),
  phone: z.string().trim().optional().nullable(),
})

export type PostAdminUpdateSubscriptionShippingAddressSchemaType = z.infer<
  typeof PostAdminUpdateSubscriptionShippingAddressSchema
>
