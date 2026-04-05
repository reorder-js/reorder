import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  GetAdminCancellationSchema,
  GetAdminCancellationsSchema,
  PostAdminApplyRetentionOfferSchema,
  PostAdminFinalizeCancellationSchema,
  PostAdminUpdateCancellationReasonSchema,
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
  {
    matcher: "/admin/cancellations/:id/apply-offer",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminApplyRetentionOfferSchema)],
  },
  {
    matcher: "/admin/cancellations/:id/finalize",
    method: "POST",
    middlewares: [validateAndTransformBody(PostAdminFinalizeCancellationSchema)],
  },
  {
    matcher: "/admin/cancellations/:id/reason",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostAdminUpdateCancellationReasonSchema),
    ],
  },
]
