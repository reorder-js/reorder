import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { PostAdminSubscriptionSettingsSchema } from "./validators"

export const adminSubscriptionSettingsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscription-settings",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostAdminSubscriptionSettingsSchema),
    ],
  },
]
