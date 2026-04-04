import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"

export type LinkSubscriptionCommerceEntitiesStepInput = {
  subscription_id: string
  customer_id: string
  cart_id: string
  order_id: string
}

export const linkSubscriptionCommerceEntitiesStep = createStep(
  "link-subscription-commerce-entities",
  async function (
    input: LinkSubscriptionCommerceEntitiesStepInput,
    { container }
  ) {
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    const links: LinkDefinition[] = [
      {
        [SUBSCRIPTION_MODULE]: {
          subscription_id: input.subscription_id,
        },
        [Modules.CUSTOMER]: {
          customer_id: input.customer_id,
        },
      },
      {
        [SUBSCRIPTION_MODULE]: {
          subscription_id: input.subscription_id,
        },
        [Modules.CART]: {
          cart_id: input.cart_id,
        },
      },
      {
        [SUBSCRIPTION_MODULE]: {
          subscription_id: input.subscription_id,
        },
        [Modules.ORDER]: {
          order_id: input.order_id,
        },
      },
    ]

    await link.create(links)

    return new StepResponse(links, links)
  },
  async function (links, { container }) {
    if (!links?.length) {
      return
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)

    await link.dismiss(links)
  }
)
