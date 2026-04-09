import {
  MiddlewareRoute,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import {
  PostStoreChangeSubscriptionAddressSchema,
  PostStoreChangeSubscriptionFrequencySchema,
  PostStorePauseSubscriptionSchema,
  PostStoreResumeSubscriptionSchema,
  PostStoreRetrySubscriptionPaymentSchema,
  PostStoreStartCancellationSchema,
  PostStoreSwapSubscriptionProductSchema,
} from "./validators"

const customerAuth = authenticate("customer", ["session", "bearer"])

export const storeCustomerSubscriptionsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/customers/me/subscriptions*",
    middlewares: [customerAuth],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/cancellation",
    method: "POST",
    middlewares: [validateAndTransformBody(PostStoreStartCancellationSchema)],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/pause",
    method: "POST",
    middlewares: [validateAndTransformBody(PostStorePauseSubscriptionSchema)],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/resume",
    method: "POST",
    middlewares: [validateAndTransformBody(PostStoreResumeSubscriptionSchema)],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/change-frequency",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostStoreChangeSubscriptionFrequencySchema),
    ],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/change-address",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostStoreChangeSubscriptionAddressSchema),
    ],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/retry-payment",
    method: "POST",
    middlewares: [
      validateAndTransformBody(PostStoreRetrySubscriptionPaymentSchema),
    ],
  },
  {
    matcher: "/store/customers/me/subscriptions/:id/swap-product",
    method: "POST",
    middlewares: [validateAndTransformBody(PostStoreSwapSubscriptionProductSchema)],
  },
]
