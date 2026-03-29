import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminRenewalSchema,
  GetAdminRenewalsSchema,
} from "./validators"

export const adminRenewalsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/renewals",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminRenewalsSchema, {
        defaults: [
          "id",
          "subscription_id",
          "scheduled_for",
          "processed_at",
          "status",
          "approval_required",
          "approval_status",
          "approval_decided_at",
          "approval_decided_by",
          "approval_reason",
          "generated_order_id",
          "last_error",
          "attempt_count",
          "created_at",
          "updated_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/renewals/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminRenewalSchema, {
        defaults: [
          "*",
        ],
        isList: false,
      }),
    ],
  },
]
