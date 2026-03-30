import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminDunningCaseSchema,
  GetAdminDunningCasesSchema,
  PostAdminDunningRetryScheduleSchema,
  PostAdminMarkRecoveredDunningSchema,
  PostAdminMarkUnrecoveredDunningSchema,
  PostAdminRetryNowDunningSchema,
} from "./validators"

export const adminDunningMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/dunning",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminDunningCasesSchema, {
        defaults: [
          "id",
          "subscription_id",
          "renewal_cycle_id",
          "renewal_order_id",
          "status",
          "attempt_count",
          "max_attempts",
          "next_retry_at",
          "last_payment_error_code",
          "last_attempt_at",
          "updated_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/dunning/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminDunningCaseSchema, {
        defaults: ["*"],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/dunning/:id/retry-now",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminRetryNowDunningSchema)],
  },
  {
    matcher: "/admin/dunning/:id/mark-recovered",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminMarkRecoveredDunningSchema)],
  },
  {
    matcher: "/admin/dunning/:id/mark-unrecovered",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminMarkUnrecoveredDunningSchema)],
  },
  {
    matcher: "/admin/dunning/:id/retry-schedule",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminDunningRetryScheduleSchema)],
  },
]
