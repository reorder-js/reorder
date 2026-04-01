import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminCancellationSchema,
  GetAdminCancellationsSchema,
} from "./validators"

export const adminCancellationsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/cancellations",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminCancellationsSchema, {
        defaults: [
          "id",
          "subscription_id",
          "status",
          "reason",
          "reason_category",
          "recommended_action",
          "final_outcome",
          "finalized_at",
          "created_at",
          "updated_at",
        ],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/cancellations/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetAdminCancellationSchema, {
        defaults: ["*"],
        isList: false,
      }),
    ],
  },
]
