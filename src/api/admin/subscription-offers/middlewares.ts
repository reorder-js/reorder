import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminSubscriptionOfferSchema,
  GetAdminSubscriptionOffersSchema,
} from "./validators"

export const adminSubscriptionOffersMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscription-offers",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionOffersSchema, {
        defaults: [
          "id",
          "name",
          "scope",
          "product_id",
          "variant_id",
          "is_enabled",
          "allowed_frequencies",
          "frequency_intervals",
          "discount_per_frequency",
          "rules",
          "updated_at",
          "created_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/subscription-offers/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionOfferSchema, {
        defaults: [
          "*",
        ],
        isList: false,
      }),
    ],
  },
]
