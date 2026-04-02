import { model } from "@medusajs/framework/utils"
import { CancellationReasonCategory } from "../../cancellation/types"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../../subscription/types"

const SubscriptionMetricsDaily = model
  .define("subscription_metrics_daily", {
    id: model.id().primaryKey(),
    metric_date: model.dateTime(),
    subscription_id: model.text(),
    customer_id: model.text(),
    product_id: model.text(),
    variant_id: model.text(),
    status: model.enum(SubscriptionStatus),
    frequency_interval: model.enum(SubscriptionFrequencyInterval),
    frequency_value: model.number(),
    currency_code: model.text().nullable(),
    is_active: model.boolean().default(false),
    active_subscriptions_count: model.number().default(0),
    mrr_amount: model.bigNumber().nullable(),
    churned_subscriptions_count: model.number().default(0),
    churn_reason_category: model.enum(CancellationReasonCategory).nullable(),
    source_snapshot: model.json().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["metric_date"],
    },
    {
      on: ["subscription_id"],
    },
    {
      on: ["product_id"],
    },
    {
      on: ["status"],
    },
    {
      on: ["currency_code"],
    },
    {
      on: ["frequency_interval"],
    },
    {
      on: ["frequency_value"],
    },
    {
      on: ["metric_date", "status"],
    },
    {
      on: ["metric_date", "product_id"],
    },
    {
      on: ["metric_date", "frequency_interval", "frequency_value"],
    },
    {
      on: ["metric_date", "currency_code"],
    },
    {
      on: ["metric_date", "churn_reason_category"],
    },
  ])

export default SubscriptionMetricsDaily
