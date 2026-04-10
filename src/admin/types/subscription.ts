export enum SubscriptionAdminStatus {
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

export enum SubscriptionDiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export type SubscriptionAdminCustomer = {
  id: string
  full_name: string
  email: string
}

export type SubscriptionAdminProduct = {
  product_id: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string | null
}

export type SubscriptionAdminFrequency = {
  interval: SubscriptionFrequencyInterval
  value: number
  label: string
}

export type SubscriptionAdminTrial = {
  is_trial: boolean
  trial_ends_at: string | null
}

export type SubscriptionAdminDiscount = {
  type: SubscriptionDiscountType
  value: number
  label: string
}

export type SubscriptionAdminPendingPlanChange = {
  variant_id: string
  variant_title: string
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  effective_at: string | null
}

export type SubscriptionAdminOrderSummary = {
  order_id: string
  display_id: number | null
  status: string
  created_at: string | null
}

export type AdminOrderSubscriptionSummary = {
  is_subscription_order: boolean
  subscription: null | {
    id: string
    reference: string
    status: SubscriptionAdminStatus
    frequency_label: string
    next_renewal_at: string | null
    effective_next_renewal_at: string | null
  }
}

export type SubscriptionAdminShippingAddress = {
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

export type SubscriptionAdminListItem = {
  id: string
  reference: string
  status: SubscriptionAdminStatus
  customer: SubscriptionAdminCustomer
  product: SubscriptionAdminProduct
  frequency: SubscriptionAdminFrequency
  next_renewal_at: string | null
  effective_next_renewal_at: string | null
  trial: SubscriptionAdminTrial
  discount: SubscriptionAdminDiscount | null
  skip_next_cycle: boolean
  updated_at: string
}

export type SubscriptionAdminDetail = SubscriptionAdminListItem & {
  created_at: string
  started_at: string
  paused_at: string | null
  cancelled_at: string | null
  last_renewal_at: string | null
  shipping_address: SubscriptionAdminShippingAddress
  pending_update_data: SubscriptionAdminPendingPlanChange | null
  initial_order: SubscriptionAdminOrderSummary | null
  renewal_orders: SubscriptionAdminOrderSummary[]
}

export type SubscriptionAdminListResponse = {
  subscriptions: SubscriptionAdminListItem[]
  count: number
  limit: number
  offset: number
}

export type SubscriptionAdminDetailResponse = {
  subscription: SubscriptionAdminDetail
}

export type AdminOrderSubscriptionSummaryResponse = {
  summary: AdminOrderSubscriptionSummary
}
