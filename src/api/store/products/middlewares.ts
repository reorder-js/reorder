import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { GetStoreProductSubscriptionOfferSchema } from "./validators"

export const storeProductMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/products/:id/subscription-offer",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetStoreProductSubscriptionOfferSchema, {
        defaults: [],
        isList: false,
      }),
    ],
  },
]
