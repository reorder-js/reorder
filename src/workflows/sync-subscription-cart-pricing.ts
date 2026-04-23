import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  refreshCartItemsWorkflow,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import { syncSubscriptionCartPricingStep } from "./steps/sync-subscription-cart-pricing"

export type SyncSubscriptionCartPricingWorkflowInput = {
  cart_id: string
}

export const syncSubscriptionCartPricingWorkflow = createWorkflow(
  "sync-subscription-cart-pricing",
  function (input: SyncSubscriptionCartPricingWorkflowInput) {
    const lockInput = transform({ input }, ({ input }) => ({
      key: input.cart_id,
      timeout: 30,
      ttl: 120,
    }))

    acquireLockStep(lockInput)

    const result = syncSubscriptionCartPricingStep(input)

    const refreshedCart = refreshCartItemsWorkflow.runAsStep({
      input: transform({ result, input }, ({ input }) => ({
        cart_id: input.cart_id,
        force_refresh: true,
      })),
    })

    releaseLockStep(
      transform({ refreshedCart, input }, ({ input }) => ({
        key: input.cart_id,
      }))
    )

    return new WorkflowResponse(
      transform({ result, refreshedCart }, ({ result }) => result)
    )
  }
)

export default syncSubscriptionCartPricingWorkflow
