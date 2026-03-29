export enum PlanOfferAdminStatus {
  ENABLED = "enabled",
  DISABLED = "disabled",
}

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

export type PlanOfferAdminTarget = {
  scope: PlanOfferScope
  product_id: string
  product_title: string
  variant_id: string | null
  variant_title: string | null
  sku: string | null
}

export type PlanOfferAdminFrequencyOption = {
  interval: PlanOfferFrequencyInterval
  value: number
  label: string
}

export type PlanOfferAdminDiscountValue = {
  type: PlanOfferDiscountType
  value: number
  label: string
}

export type PlanOfferAdminRules = {
  minimum_cycles: number | null
  trial_enabled: boolean
  trial_days: number | null
  stacking_policy: "allowed" | "disallow_all" | "disallow_subscription_discounts"
}

export type PlanOfferAdminEffectiveConfigSummary = {
  source_scope: PlanOfferScope | null
  source_offer_id: string | null
  allowed_frequencies: PlanOfferAdminFrequencyOption[]
  discounts: PlanOfferAdminDiscountValue[]
  rules: PlanOfferAdminRules | null
}

export type PlanOfferAdminListItem = {
  id: string
  name: string
  status: PlanOfferAdminStatus
  is_enabled: boolean
  target: PlanOfferAdminTarget
  allowed_frequencies: PlanOfferAdminFrequencyOption[]
  discounts: PlanOfferAdminDiscountValue[]
  rules_summary: string | null
  effective_config_summary: PlanOfferAdminEffectiveConfigSummary
  updated_at: string
}

export type PlanOfferAdminDetail = PlanOfferAdminListItem & {
  created_at: string
  metadata: Record<string, unknown> | null
  rules: PlanOfferAdminRules | null
}

export type PlanOfferAdminListResponse = {
  plan_offers: PlanOfferAdminListItem[]
  count: number
  limit: number
  offset: number
}

export type PlanOfferAdminDetailResponse = {
  plan_offer: PlanOfferAdminDetail
}

export type CreatePlanOfferAdminRequest = {
  name: string
  scope: PlanOfferScope
  product_id: string
  variant_id?: string | null
  is_enabled: boolean
  allowed_frequencies: Array<{
    interval: PlanOfferFrequencyInterval
    value: number
  }>
  discounts: Array<{
    interval: PlanOfferFrequencyInterval
    value: number
    type: PlanOfferDiscountType
  }>
  rules?: PlanOfferAdminRules | null
  metadata?: Record<string, unknown> | null
}

export type UpdatePlanOfferAdminRequest = Partial<CreatePlanOfferAdminRequest>

export type TogglePlanOfferAdminRequest = {
  is_enabled: boolean
}
