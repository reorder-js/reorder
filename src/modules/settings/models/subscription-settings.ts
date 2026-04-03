import { model } from "@medusajs/framework/utils"
import {
  GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../types"

const SubscriptionSettings = model
  .define("subscription_settings", {
    id: model.id().primaryKey(),
    settings_key: model
      .text()
      .default(GLOBAL_SUBSCRIPTION_SETTINGS_KEY)
      .unique(),
    default_trial_days: model.number().default(0),
    dunning_retry_intervals: model.json(),
    max_dunning_attempts: model.number().default(3),
    default_renewal_behavior: model
      .enum(SubscriptionRenewalBehavior)
      .default(SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY),
    default_cancellation_behavior: model
      .enum(SubscriptionCancellationBehavior)
      .default(SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST),
    version: model.number().default(0),
    updated_by: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["settings_key"],
      unique: true,
    },
  ])

export default SubscriptionSettings
