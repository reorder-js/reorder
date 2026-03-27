import { defineMiddlewares } from "@medusajs/framework/http"
import { adminSubscriptionsMiddlewares } from "./admin/subscriptions/middlewares"

export default defineMiddlewares({
  routes: [...adminSubscriptionsMiddlewares],
})
