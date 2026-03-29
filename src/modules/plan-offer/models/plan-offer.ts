import { model } from "@medusajs/framework/utils"
import { PlanOfferScope } from "../types"

const PlanOffer = model.define("plan_offer", {
  id: model.id().primaryKey(),
  name: model.text(),
  scope: model.enum(PlanOfferScope),
  product_id: model.text(),
  variant_id: model.text().nullable(),
  is_enabled: model.boolean().default(true),
  allowed_frequencies: model.json(),
  frequency_intervals: model.array().default([]),
  discount_per_frequency: model.json().nullable(),
  rules: model.json().nullable(),
  metadata: model.json().nullable(),
}).indexes([
  {
    on: ["scope"],
  },
  {
    on: ["product_id"],
  },
  {
    on: ["variant_id"],
  },
  {
    on: ["is_enabled"],
  },
  {
    on: ["name"],
  },
])

export default PlanOffer
