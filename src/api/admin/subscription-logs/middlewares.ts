import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminSubscriptionLogSchema,
  GetAdminSubscriptionLogsSchema,
} from "./validators"

export const adminSubscriptionLogsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscription-logs",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionLogsSchema, {
        defaults: [
          "id",
          "subscription_id",
          "customer_id",
          "event_type",
          "actor_type",
          "actor_id",
          "subscription_reference",
          "customer_name",
          "product_title",
          "variant_title",
          "reason",
          "changed_fields",
          "created_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/subscription-logs/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionLogSchema, {
        defaults: ["*"],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/subscriptions/:id/logs",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionLogsSchema, {
        defaults: [
          "id",
          "subscription_id",
          "customer_id",
          "event_type",
          "actor_type",
          "actor_id",
          "subscription_reference",
          "customer_name",
          "product_title",
          "variant_title",
          "reason",
          "changed_fields",
          "created_at",
        ],
        isList: true,
      }),
    ],
  },
]
