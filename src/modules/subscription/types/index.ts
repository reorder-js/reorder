import type { InferTypeOf } from "@medusajs/framework/types"
import Subscription from "./../models/subscription"
import type { Override } from "../../../common/utils/override"
import type { FrequencyInterval } from "../../../common/types/frequency-interval"

export enum SubscriptionStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  CANCELLED = "cancelled",
  PAST_DUE = "past_due",
}

export type SubscriptionCustomerSnapshot = {
  email: string
  full_name: string | null
}

export type SubscriptionProductSnapshot = {
  product_id: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string | null
}

export type SubscriptionSourceSnapshot = {
  product_id: string
  variant_id: string | null
  title: string
  quantity: number
  unit_price: number
  subtitle: string | null
  sku: string | null
  is_discountable: boolean | null
  is_tax_inclusive: boolean | null
  requires_shipping: boolean | null
  tax_lines: {
    code: string
    rate: number
    description: string | null
  }[] | null
  adjustments: {
    amount: number
    code: string | null
    description: string | null
  }[] | null
}

export type SubscriptionPricingSnapshot = {
  discount_type: "percentage" | "fixed"
  discount_value: number
  label: string | null
}

export type SubscriptionShippingAddress = {
  first_name: string
  last_name: string
  company: string | null
  address_1: string
  address_2: string | null
  city: string
  postal_code: string
  province: string | null
  country_code: string
  phone: string | null
}

export type SubscriptionPaymentContext = {
  payment_provider_id: string | null
  source_payment_collection_id: string | null
  source_payment_session_id: string | null
  payment_method_reference: string | null
  customer_payment_reference: string | null
}

export type SubscriptionPendingUpdateData = {
  variant_id: string
  variant_title: string
  sku: string | null
  frequency_interval: FrequencyInterval
  frequency_value: number
  effective_at: string | null
  requested_at: string
  requested_by: string | null
}

export type SubscriptionType = Override<InferTypeOf<typeof Subscription>, {
  customer_snapshot: SubscriptionCustomerSnapshot | null
  product_snapshot: SubscriptionProductSnapshot
  pricing_snapshot: SubscriptionPricingSnapshot | null
  source_snapshot: SubscriptionSourceSnapshot
  shipping_address: SubscriptionShippingAddress
  payment_context: SubscriptionPaymentContext | null
  pending_update_data: SubscriptionPendingUpdateData | null
  metadata: Record<string, unknown> | null

}>

export type SubscriptionQueryType = Override<SubscriptionType, {
  started_at: string
  next_renewal_at: string | null
  last_renewal_at: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_effective_at: string | null
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}>
