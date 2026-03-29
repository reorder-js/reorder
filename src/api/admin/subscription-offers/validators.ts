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
