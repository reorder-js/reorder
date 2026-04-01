import { model } from "@medusajs/framework/utils"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../types"

const SubscriptionLog = model
  .define("subscription_log", {
    id: model.id().primaryKey(),
    subscription_id: model.text(),
    customer_id: model.text().nullable(),
    event_type: model.enum(ActivityLogEventType),
    actor_type: model.enum(ActivityLogActorType),
    actor_id: model.text().nullable(),
    subscription_reference: model.text(),
    customer_name: model.text().nullable(),
    product_title: model.text().nullable(),
    variant_title: model.text().nullable(),
    reason: model.text().nullable(),
    dedupe_key: model.text().unique(),
    previous_state: model.json().nullable(),
    new_state: model.json().nullable(),
    changed_fields: model.json().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["dedupe_key"],
      unique: true,
    },
    {
      on: ["subscription_id"],
    },
    {
      on: ["customer_id"],
    },
    {
      on: ["event_type"],
    },
    {
      on: ["created_at"],
    },
    {
      on: ["subscription_id", "created_at"],
    },
    {
      on: ["customer_id", "created_at"],
    },
    {
      on: ["event_type", "created_at"],
    },
  ])

export default SubscriptionLog
