export enum SubscriptionStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  CANCELLED = "cancelled",
  PAST_DUE = "past_due",
}

export enum SubscriptionFrequencyInterval {
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
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

export type SubscriptionPaymentMethodSummary = {
  id: string
  provider_id: string
  type: string | null
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  created_at: number | null
}

export type SubscriptionAccountHolderRecord = {
  id: string
  provider_id: string
  external_id?: string | null
  email?: string | null
  data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type SubscriptionPaymentMethodRecord = {
  id: string
  provider_id?: string | null
  data?: Record<string, unknown> | null
}

export type SubscriptionPendingUpdateData = {
  variant_id: string
  variant_title: string
  sku: string | null
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  effective_at: string | null
  requested_at: string
  requested_by: string | null
}
