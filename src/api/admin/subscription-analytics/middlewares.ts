import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { PostAdminSubscriptionAnalyticsRebuildSchema } from "./validators"

export const adminSubscriptionAnalyticsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscription-analytics/rebuild",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostAdminSubscriptionAnalyticsRebuildSchema),
    ],
  },
]
