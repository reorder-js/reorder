import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type {
  PlanOfferAllowedFrequency,
  PlanOfferDiscountPerFrequency,
  PlanOfferRules,
  ProductSubscriptionConfig,
} from "../types"
import { PlanOfferScope } from "../types"

type PlanOfferRecord = {
  id: string
  scope: "product" | "variant"
  product_id: string
  variant_id: string | null
  allowed_frequencies: PlanOfferAllowedFrequency[]
  discount_per_frequency: PlanOfferDiscountPerFrequency[] | null
  rules: PlanOfferRules | null
}

const effectiveConfigFields = [
  "id",
  "scope",
  "product_id",
  "variant_id",
  "allowed_frequencies",
  "discount_per_frequency",
  "rules",
] as const

export function mapRecordToEffectiveConfig(
  record: PlanOfferRecord
): ProductSubscriptionConfig {
  return {
    product_id: record.product_id,
    variant_id: record.variant_id,
    source_offer_id: record.id,
    source_scope:
      record.scope === "product"
        ? PlanOfferScope.PRODUCT
        : PlanOfferScope.VARIANT,
    is_enabled: true,
    allowed_frequencies: record.allowed_frequencies ?? [],
    discount_per_frequency: record.discount_per_frequency ?? [],
    rules: record.rules,
  }
}

export function getInactiveEffectiveConfig(input: {
  product_id: string
  variant_id?: string | null
}): ProductSubscriptionConfig {
  return {
    product_id: input.product_id,
    variant_id: input.variant_id ?? null,
    source_offer_id: null,
    source_scope: null,
    is_enabled: false,
    allowed_frequencies: [],
    discount_per_frequency: [],
    rules: null,
  }
}

export async function resolveProductSubscriptionConfig(
  container: MedusaContainer,
  input: {
    product_id: string
    variant_id?: string | null
  }
): Promise<ProductSubscriptionConfig> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (input.variant_id) {
    const { data: variantData } = await query.graph({
      entity: "plan_offer",
      fields: [...effectiveConfigFields],
      filters: {
        scope: "variant",
        variant_id: input.variant_id,
        is_enabled: true,
      },
      pagination: {
        take: 1,
      },
    })

    const variantRecord = (variantData as PlanOfferRecord[])[0]

    if (variantRecord) {
      return mapRecordToEffectiveConfig(variantRecord)
    }
  }

  const { data: productData } = await query.graph({
    entity: "plan_offer",
    fields: [...effectiveConfigFields],
    filters: {
      scope: "product",
      product_id: input.product_id,
      is_enabled: true,
    },
    pagination: {
      take: 1,
    },
  })

  const productRecord = (productData as PlanOfferRecord[])[0]

  if (productRecord) {
    return {
      ...mapRecordToEffectiveConfig(productRecord),
      variant_id: input.variant_id ?? null,
    }
  }

  return getInactiveEffectiveConfig(input)
}
