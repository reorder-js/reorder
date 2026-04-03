import { defineMiddlewares } from "@medusajs/framework/http"
import { adminSubscriptionsMiddlewares } from "./admin/subscriptions/middlewares"
import { adminSubscriptionOffersMiddlewares } from "./admin/subscription-offers/middlewares"
import { adminRenewalsMiddlewares } from "./admin/renewals/middlewares"
import { adminDunningMiddlewares } from "./admin/dunning/middlewares"
import { adminCancellationsMiddlewares } from "./admin/cancellations/middlewares"
import { adminSubscriptionLogsMiddlewares } from "./admin/subscription-logs/middlewares"
import { adminSubscriptionAnalyticsMiddlewares } from "./admin/subscription-analytics/middlewares"
import { adminSubscriptionSettingsMiddlewares } from "./admin/subscription-settings/middlewares"

export default defineMiddlewares({
  routes: [
    ...adminSubscriptionsMiddlewares,
    ...adminSubscriptionSettingsMiddlewares,
    ...adminSubscriptionAnalyticsMiddlewares,
    ...adminSubscriptionLogsMiddlewares,
    ...adminSubscriptionOffersMiddlewares,
    ...adminRenewalsMiddlewares,
    ...adminDunningMiddlewares,
    ...adminCancellationsMiddlewares,
  ],
})
