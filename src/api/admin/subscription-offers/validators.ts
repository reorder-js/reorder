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

const planOfferScopeSchema = z.enum(["product", "variant"])
const planOfferFrequencyIntervalSchema = z.enum(["week", "month", "year"])
const planOfferDiscountTypeSchema = z.enum(["percentage", "fixed"])
const planOfferStackingPolicySchema = z.enum([
  "allowed",
  "disallow_all",
  "disallow_subscription_discounts",
])

const planOfferFrequencyInputSchema = z.object({
  interval: planOfferFrequencyIntervalSchema,
  value: z.number().int().positive(),
})

const planOfferDiscountInputSchema = z.object({
  interval: planOfferFrequencyIntervalSchema,
  frequency_value: z.number().int().positive(),
  type: planOfferDiscountTypeSchema,
  value: z.number().positive(),
})

const planOfferRulesSchema = z.object({
  minimum_cycles: z.number().int().positive().nullable(),
  trial_enabled: z.boolean(),
  trial_days: z.number().int().positive().nullable(),
  stacking_policy: planOfferStackingPolicySchema,
})

export const GetAdminSubscriptionOffersSchema = createFindParams({
  offset: 0,
  limit: 20,
}).extend({
  q: z.string().optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  is_enabled: stringToBoolean.optional(),
  scope: planOfferScopeSchema.optional(),
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  frequency: planOfferFrequencyIntervalSchema.optional(),
})

export type GetAdminSubscriptionOffersSchemaType = z.infer<
  typeof GetAdminSubscriptionOffersSchema
>

export const GetAdminSubscriptionOfferSchema = createFindParams().extend({})

export type GetAdminSubscriptionOfferSchemaType = z.infer<
  typeof GetAdminSubscriptionOfferSchema
>

export const PostAdminCreateSubscriptionOfferSchema = z.object({
  name: z.string().trim().min(1),
  scope: planOfferScopeSchema,
  product_id: z.string().trim().min(1),
  variant_id: z.string().trim().min(1).nullable().optional(),
  is_enabled: z.boolean(),
  allowed_frequencies: z.array(planOfferFrequencyInputSchema).min(1),
  discounts: z.array(planOfferDiscountInputSchema).optional().nullable(),
  rules: planOfferRulesSchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export type PostAdminCreateSubscriptionOfferSchemaType = z.infer<
  typeof PostAdminCreateSubscriptionOfferSchema
>

export const PostAdminUpdateSubscriptionOfferSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    is_enabled: z.boolean().optional(),
    allowed_frequencies: z.array(planOfferFrequencyInputSchema).min(1).optional(),
    discounts: z.array(planOfferDiscountInputSchema).optional().nullable(),
    rules: planOfferRulesSchema.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be provided"
  )

export type PostAdminUpdateSubscriptionOfferSchemaType = z.infer<
  typeof PostAdminUpdateSubscriptionOfferSchema
>

export const PostAdminToggleSubscriptionOfferSchema = z.object({
  is_enabled: z.boolean(),
})

export type PostAdminToggleSubscriptionOfferSchemaType = z.infer<
  typeof PostAdminToggleSubscriptionOfferSchema
>
