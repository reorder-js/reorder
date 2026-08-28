import { z } from "@medusajs/framework/zod"

export const GetStoreProductSubscriptionOfferSchema = z.object({
  variant_id: z.string().optional(),
})

export type GetStoreProductSubscriptionOfferSchemaType = z.infer<
  typeof GetStoreProductSubscriptionOfferSchema
>
