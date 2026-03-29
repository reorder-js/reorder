import { defineLink } from "@medusajs/framework/utils"
import RenewalModule from "../modules/renewal"
import SubscriptionModule from "../modules/subscription"

export default defineLink(SubscriptionModule.linkable.subscription, {
  linkable: RenewalModule.linkable.renewalCycle.id,
  isList: true,
})
