import {
  MiddlewareRoute,
  validateAndTransformQuery,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import {
  GetAdminSubscriptionAnalyticsExportSchema,
  GetAdminSubscriptionAnalyticsKpisSchema,
  GetAdminSubscriptionAnalyticsTrendsSchema,
  PostAdminSubscriptionAnalyticsRebuildSchema,
} from "./validators"

export const adminSubscriptionAnalyticsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/subscription-analytics/kpis",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionAnalyticsKpisSchema, {
        defaults: [],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/subscription-analytics/trends",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionAnalyticsTrendsSchema, {
        defaults: [],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/subscription-analytics/export",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminSubscriptionAnalyticsExportSchema, {
        defaults: [],
        isList: false,
      }),
    ],
  },
  {
    matcher: "/admin/subscription-analytics/rebuild",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostAdminSubscriptionAnalyticsRebuildSchema),
    ],
  },
]
