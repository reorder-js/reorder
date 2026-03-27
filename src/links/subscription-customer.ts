import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"
import SubscriptionModule from "../modules/subscription"

export default defineLink(
  {
    linkable: SubscriptionModule.linkable.subscription.id,
    isList: true,
  },
  CustomerModule.linkable.customer
)
