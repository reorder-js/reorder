import { MedusaError } from "@medusajs/framework/utils"
import { PlanOfferScope } from "../types"

export const planOfferErrors = {
  notFound(entity: string, id: string) {
    return new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `${entity} '${id}' was not found`
    )
  },
  invalidData(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  conflict(message: string) {
    return new MedusaError(MedusaError.Types.CONFLICT, message)
  },
  invalidScopeTarget(scope: PlanOfferScope | "product" | "variant") {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid target configuration for '${scope}' scope`
    )
  },
  variantScopeRequiresVariantId() {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Variant-scoped offers require 'variant_id'"
    )
  },
  productScopeDisallowsVariantId() {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Product-scoped offers can't specify 'variant_id'"
    )
  },
  productNotFound(productId: string) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Product '${productId}' was not found`
    )
  },
  variantDoesNotBelongToProduct(variantId: string, productId: string) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Variant '${variantId}' does not belong to product '${productId}'`
    )
  },
  allowedFrequenciesRequired() {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "'allowed_frequencies' must contain at least one frequency"
    )
  },
  duplicateFrequency(interval: string, value: number) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Duplicate frequency '${interval}:${value}' is not allowed`
    )
  },
  invalidFrequencyMix(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  discountFrequencyNotAllowed(interval: string, value: number) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Discount frequency '${interval}:${value}' is not allowed`
    )
  },
  duplicateDiscountForFrequency(interval: string, value: number) {
    return new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Duplicate discount for frequency '${interval}:${value}' is not allowed`
    )
  },
  discountOutOfRange(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  invalidTrialConfiguration(message: string) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, message)
  },
  conflictingOverrideConfiguration(message: string) {
    return new MedusaError(MedusaError.Types.CONFLICT, message)
  },
}
