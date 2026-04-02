import { defineMiddlewares } from "@medusajs/framework/http"
import { adminSubscriptionsMiddlewares } from "./admin/subscriptions/middlewares"
import { adminSubscriptionOffersMiddlewares } from "./admin/subscription-offers/middlewares"
import { adminRenewalsMiddlewares } from "./admin/renewals/middlewares"
import { adminDunningMiddlewares } from "./admin/dunning/middlewares"
import { adminCancellationsMiddlewares } from "./admin/cancellations/middlewares"
import { adminSubscriptionLogsMiddlewares } from "./admin/subscription-logs/middlewares"

export default defineMiddlewares({
  routes: [
    ...adminSubscriptionsMiddlewares,
    ...adminSubscriptionLogsMiddlewares,
    ...adminSubscriptionOffersMiddlewares,
    ...adminRenewalsMiddlewares,
    ...adminDunningMiddlewares,
    ...adminCancellationsMiddlewares,
  ],
})
