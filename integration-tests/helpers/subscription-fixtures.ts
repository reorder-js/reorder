import jwt from "jsonwebtoken"
import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionPaymentContext,
  SubscriptionStatus,
} from "../../src/modules/subscription/types"

type ProductModuleService = {
  createProducts(data: Record<string, unknown>): Promise<Record<string, any>>
}

type AuthModuleService = {
  createAuthIdentities(data: Record<string, unknown>): Promise<{ id: string }>
}

type UserModuleService = {
  createUsers(data: Record<string, unknown>): Promise<{ id: string; email: string }>
}

type SubscriptionSeedInput = {
  id?: string
  reference?: string
  status?: SubscriptionStatus
  customer_id?: string
  cart_id?: string | null
  product_id?: string
  variant_id?: string
  frequency_interval?: SubscriptionFrequencyInterval
  frequency_value?: number
  next_renewal_at?: Date | null
  skip_next_cycle?: boolean
  is_trial?: boolean
  payment_context?: SubscriptionPaymentContext | null
}

export async function createAdminAuthHeaders(container: MedusaContainer) {
  const authModule = container.resolve<AuthModuleService>(Modules.AUTH)
  const userModule = container.resolve<UserModuleService>(Modules.USER)

  const email = `admin-${Date.now()}@medusa.test`
  const user = await userModule.createUsers({
    email,
    first_name: "Admin",
    last_name: "Tester",
  })

  const authIdentity = await authModule.createAuthIdentities({
    provider_identities: [
      {
        provider: "emailpass",
        entity_id: email,
        provider_metadata: {
          password: "supersecret",
        },
      },
    ],
    app_metadata: {
      user_id: user.id,
      roles: [],
    },
  })

  const token = jwt.sign(
    {
      actor_id: user.id,
      actor_type: "user",
      auth_identity_id: authIdentity.id,
      app_metadata: {
        user_id: user.id,
        roles: [],
      },
      user_metadata: {},
    },
    process.env.JWT_SECRET || "supersecret",
    {
      expiresIn: "1d",
    }
  )

  return {
    authorization: `Bearer ${token}`,
  }
}

export async function createProductWithVariant(container: MedusaContainer) {
  const productModule = container.resolve<ProductModuleService>(Modules.PRODUCT)

  const product = await productModule.createProducts({
    title: `Subscription Product ${Date.now()}`,
    status: "draft",
    options: [
      {
        title: "Plan",
        values: ["Default"],
      },
    ],
    variants: [
      {
        title: "Default Variant",
        sku: `SUB-SKU-${Date.now()}`,
        manage_inventory: false,
        options: {
          Plan: "Default",
        },
      },
    ],
  })

  const variant = product.variants?.[0]

  if (!variant) {
    throw new Error("Failed to create product variant for test")
  }

  return {
    product,
    variant,
  }
}

export async function createSubscriptionSeed(
  container: MedusaContainer,
  input: SubscriptionSeedInput = {}
) {
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
  const customerId = input.customer_id ?? `cus_${Date.now()}`
  const cartId =
    input.cart_id === undefined ? `cart_${Date.now()}` : input.cart_id
  const productId = input.product_id ?? `prod_${Date.now()}`
  const variantId = input.variant_id ?? `variant_${Date.now()}`

  const created = await subscriptionModule.createSubscriptions({
    id: input.id,
    reference: input.reference ?? `SUB-${Date.now()}`,
    status: input.status ?? SubscriptionStatus.ACTIVE,
    customer_id: customerId,
    cart_id: cartId,
    product_id: productId,
    variant_id: variantId,
    frequency_interval:
      input.frequency_interval ?? SubscriptionFrequencyInterval.MONTH,
    frequency_value: input.frequency_value ?? 1,
    started_at: new Date(),
    next_renewal_at:
      input.next_renewal_at === undefined
        ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
        : input.next_renewal_at,
    last_renewal_at: null,
    paused_at: null,
    cancelled_at: null,
    cancel_effective_at: null,
    skip_next_cycle: input.skip_next_cycle ?? false,
    is_trial: input.is_trial ?? false,
    trial_ends_at: null,
    customer_snapshot: {
      email: "customer@example.com",
      full_name: "Customer Test",
    },
    product_snapshot: {
      product_id: productId,
      product_title: "Subscription Product",
      variant_id: variantId,
      variant_title: "Default Variant",
      sku: "SUB-SKU-001",
    },
    pricing_snapshot: {
      discount_type: "percentage",
      discount_value: 10,
      label: "10% off",
    },
    shipping_address: {
      first_name: "Jan",
      last_name: "Kowalski",
      company: null,
      address_1: "Testowa 1",
      address_2: null,
      city: "Warszawa",
      postal_code: "00-001",
      province: "Mazowieckie",
      country_code: "PL",
      phone: "+48123123123",
    },
    payment_context:
      input.payment_context === undefined
        ? {
            payment_provider_id: "pp_stripe_stripe",
            source_payment_collection_id: `paycol_${Date.now()}`,
            source_payment_session_id: `payses_${Date.now()}`,
            payment_method_reference: `pm_${Date.now()}`,
            customer_payment_reference: `cuspay_${Date.now()}`,
          }
        : input.payment_context,
    pending_update_data: null,
    metadata: null,
  })

  return created
}
