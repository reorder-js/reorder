import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import SubscriptionModule from "../modules/subscription"

export default defineLink(SubscriptionModule.linkable.subscription, {
  linkable: OrderModule.linkable.order.id,
  isList: true,
})
