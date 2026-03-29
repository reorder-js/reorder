export enum PlanOfferScope {
  PRODUCT = "product",
  VARIANT = "variant",
}

export enum PlanOfferFrequencyInterval {
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
}

export enum PlanOfferDiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export enum PlanOfferStackingPolicy {
  ALLOWED = "allowed",
  DISALLOW_ALL = "disallow_all",
  DISALLOW_SUBSCRIPTION_DISCOUNTS = "disallow_subscription_discounts",
}

export type PlanOfferAllowedFrequency = {
  interval: PlanOfferFrequencyInterval
  value: number
}

export type PlanOfferDiscountPerFrequency = {
  interval: PlanOfferFrequencyInterval
  value: number
  discount_type: PlanOfferDiscountType
  discount_value: number
}

export type PlanOfferRules = {
  minimum_cycles: number | null
  trial_enabled: boolean
  trial_days: number | null
  stacking_policy: PlanOfferStackingPolicy
}

export type ProductSubscriptionConfig = {
  product_id: string
  variant_id: string | null
  source_offer_id: string | null
  source_scope: PlanOfferScope | null
  is_enabled: boolean
  allowed_frequencies: PlanOfferAllowedFrequency[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[]
  rules: PlanOfferRules | null
}
