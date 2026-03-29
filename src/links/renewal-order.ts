import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import RenewalModule from "../modules/renewal"

export default defineLink(RenewalModule.linkable.renewalCycle, {
  linkable: OrderModule.linkable.order.id,
})
