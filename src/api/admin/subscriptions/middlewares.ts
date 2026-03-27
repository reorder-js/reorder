import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminSubscriptionSchema,
  GetAdminSubscriptionsSchema,
  PostAdminCancelSubscriptionSchema,
  PostAdminPauseSubscriptionSchema,
  PostAdminResumeSubscriptionSchema,
  PostAdminScheduleSubscriptionPlanChangeSchema,
  PostAdminUpdateSubscriptionShippingAddressSchema,
} from "./validators"

export const adminSubscriptionsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscriptions",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionsSchema, {
        defaults: [
          "id",
          "reference",
          "status",
          "customer_id",
          "product_id",
          "variant_id",
          "frequency_interval",
          "frequency_value",
          "next_renewal_at",
          "last_renewal_at",
          "paused_at",
          "cancelled_at",
          "skip_next_cycle",
          "is_trial",
          "trial_ends_at",
          "customer_snapshot",
          "product_snapshot",
          "pricing_snapshot",
          "updated_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/subscriptions/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionSchema, {
        defaults: [
          "*",
        ],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/subscriptions/:id/pause",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminPauseSubscriptionSchema)],
  },
  {
    matcher: "/admin/subscriptions/:id/resume",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminResumeSubscriptionSchema)],
  },
  {
    matcher: "/admin/subscriptions/:id/cancel",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminCancelSubscriptionSchema)],
  },
  {
    matcher: "/admin/subscriptions/:id/schedule-plan-change",
    method: "POST",
    middlewares: [
      validateAndTransformBody(
        PostAdminScheduleSubscriptionPlanChangeSchema
      ),
    ],
  },
  {
    matcher: "/admin/subscriptions/:id/update-shipping-address",
    method: "POST",
    middlewares: [
      validateAndTransformBody(
        PostAdminUpdateSubscriptionShippingAddressSchema
      ),
    ],
  },
]
