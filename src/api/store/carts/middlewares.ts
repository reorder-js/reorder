import { type MiddlewareRoute, validateAndTransformQuery } from "@medusajs/framework/http"
import { StoreGetOrdersParams } from "@medusajs/medusa/api/store/orders/validators"
import * as QueryConfig from "@medusajs/medusa/api/store/orders/query-config"

export const storeCartRoutesMiddlewares: MiddlewareRoute[] = [
  // Matches route config of MedusaJS' native `/store/carts/{cartId}/complete`
  {
    matcher: "/store/carts/:id/subscribe",
    method: "POST",
    middlewares: [
      validateAndTransformQuery(StoreGetOrdersParams, QueryConfig.retrieveTransformQueryConfig),
    ],
  },
]
