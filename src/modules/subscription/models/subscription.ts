import { model } from "@medusajs/framework/utils"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../types"

const Subscription = model
  .define("subscription", {
    id: model.id().primaryKey(),
    reference: model.text().unique(),
    status: model.enum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
    customer_id: model.text(),
    product_id: model.text(),
    variant_id: model.text(),
    frequency_interval: model.enum(SubscriptionFrequencyInterval),
    frequency_value: model.number(),
    started_at: model.dateTime(),
    next_renewal_at: model.dateTime().nullable(),
    last_renewal_at: model.dateTime().nullable(),
    paused_at: model.dateTime().nullable(),
    cancelled_at: model.dateTime().nullable(),
    cancel_effective_at: model.dateTime().nullable(),
    skip_next_cycle: model.boolean().default(false),
    is_trial: model.boolean().default(false),
    trial_ends_at: model.dateTime().nullable(),
    customer_snapshot: model.json().nullable(),
    product_snapshot: model.json(),
    pricing_snapshot: model.json().nullable(),
    shipping_address: model.json(),
    pending_update_data: model.json().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["reference"],
      unique: true,
    },
    {
      on: ["status"],
    },
    {
      on: ["next_renewal_at"],
    },
    {
      on: ["customer_id"],
    },
    {
      on: ["product_id"],
    },
    {
      on: ["variant_id"],
    },
    {
      on: ["is_trial"],
    },
    {
      on: ["skip_next_cycle"],
    },
  ])

export default Subscription
