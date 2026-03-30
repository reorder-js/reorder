import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import {
  PostAdminDunningRetryScheduleSchema,
  PostAdminMarkRecoveredDunningSchema,
  PostAdminMarkUnrecoveredDunningSchema,
  PostAdminRetryNowDunningSchema,
} from "./validators"

export const adminDunningMiddlewares: MiddlewareRoute[] = [
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
