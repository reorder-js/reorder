import type { CartWorkflowDTO } from "@medusajs/framework/types"
import { isSubscriptionItem } from "./is-subscription-item"

export const CartCompleteAllowedMetadataKey = "_completeAllowed" as const

/**
 * Checks whether given cart can be completed (i.e. used in `completeCartWorkflow`).
 * This is used to prevent completing carts which contain subscription items outside of flows
 * that can handle those items.
 * Returns `true` when:
 *  - cart does doesn't contain subscription items
 *  - cart contains subscription items AND has special metadata property present
 */
export const canCompleteCart = (cart: CartWorkflowDTO): boolean => {
  if (!cart.items?.some(isSubscriptionItem)) return true

  if (cart.metadata?.[CartCompleteAllowedMetadataKey] === true) return true

  return false
}
