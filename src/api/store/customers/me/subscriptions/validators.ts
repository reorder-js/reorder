import { z } from "zod"
import { CancellationReasonCategory } from "../../../../../modules/cancellation/types"

const metadataSchema = z.record(z.string(), z.unknown()).optional()
const optionalDateTime = z.string().datetime().optional()
const subscriptionFrequencyIntervalSchema = z.enum(["week", "month", "year"])

export const PostStoreStartCancellationSchema = z.object({
  reason: z.string().trim().min(1),
  reason_category: z.nativeEnum(CancellationReasonCategory).optional(),
  notes: z.string().trim().optional(),
  metadata: metadataSchema,
})

export type PostStoreStartCancellationSchemaType = z.infer<
  typeof PostStoreStartCancellationSchema
>

export const PostStorePauseSubscriptionSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  effective_at: optionalDateTime,
})

export type PostStorePauseSubscriptionSchemaType = z.infer<
  typeof PostStorePauseSubscriptionSchema
>

export const PostStoreResumeSubscriptionSchema = z.object({
  resume_at: optionalDateTime,
  preserve_billing_anchor: z.boolean().optional(),
})

export type PostStoreResumeSubscriptionSchemaType = z.infer<
  typeof PostStoreResumeSubscriptionSchema
>

export const PostStoreChangeSubscriptionFrequencySchema = z.object({
  frequency_interval: subscriptionFrequencyIntervalSchema,
  frequency_value: z.number().int().positive(),
  effective_at: optionalDateTime,
})

export type PostStoreChangeSubscriptionFrequencySchemaType = z.infer<
  typeof PostStoreChangeSubscriptionFrequencySchema
>

export const PostStoreChangeSubscriptionAddressSchema = z.object({
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

export type PostStoreChangeSubscriptionAddressSchemaType = z.infer<
  typeof PostStoreChangeSubscriptionAddressSchema
>

export const PostStoreSwapSubscriptionProductSchema = z.object({
  variant_id: z.string().min(1),
  frequency_interval: subscriptionFrequencyIntervalSchema,
  frequency_value: z.number().int().positive(),
  effective_at: optionalDateTime,
})

export type PostStoreSwapSubscriptionProductSchemaType = z.infer<
  typeof PostStoreSwapSubscriptionProductSchema
>

export const PostStoreRetrySubscriptionPaymentSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

export type PostStoreRetrySubscriptionPaymentSchemaType = z.infer<
  typeof PostStoreRetrySubscriptionPaymentSchema
>
