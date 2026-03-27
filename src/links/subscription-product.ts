import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import SubscriptionModule from "../modules/subscription"

export default defineLink(
  {
    linkable: SubscriptionModule.linkable.subscription.id,
    isList: true,
  },
  ProductModule.linkable.product
)
