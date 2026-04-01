import { defineLink } from "@medusajs/framework/utils"
import CancellationModule from "../modules/cancellation"
import SubscriptionModule from "../modules/subscription"

export default defineLink(SubscriptionModule.linkable.subscription, {
  linkable: CancellationModule.linkable.cancellationCase.id,
  isList: true,
})
