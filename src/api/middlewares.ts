import { defineMiddlewares } from "@medusajs/framework/http"
import { adminSubscriptionsMiddlewares } from "./admin/subscriptions/middlewares"
import { adminSubscriptionOffersMiddlewares } from "./admin/subscription-offers/middlewares"
import { adminRenewalsMiddlewares } from "./admin/renewals/middlewares"
import { adminDunningMiddlewares } from "./admin/dunning/middlewares"
import { adminCancellationsMiddlewares } from "./admin/cancellations/middlewares"

export default defineMiddlewares({
  routes: [
    ...adminSubscriptionsMiddlewares,
    ...adminSubscriptionOffersMiddlewares,
    ...adminRenewalsMiddlewares,
    ...adminDunningMiddlewares,
    ...adminCancellationsMiddlewares,
  ],
})
