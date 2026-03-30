import { model } from "@medusajs/framework/utils"
import DunningAttempt from "./dunning-attempt"
import { DunningCaseStatus } from "../types"

const DunningCase = model
  .define("dunning_case", {
    id: model.id().primaryKey(),
    subscription_id: model.text(),
    renewal_cycle_id: model.text(),
    renewal_order_id: model.text().nullable(),
    status: model.enum(DunningCaseStatus).default(DunningCaseStatus.OPEN),
    attempt_count: model.number().default(0),
    max_attempts: model.number(),
    retry_schedule: model.json().nullable(),
    next_retry_at: model.dateTime().nullable(),
    last_payment_error_code: model.text().nullable(),
    last_payment_error_message: model.text().nullable(),
    last_attempt_at: model.dateTime().nullable(),
    recovered_at: model.dateTime().nullable(),
    closed_at: model.dateTime().nullable(),
    recovery_reason: model.text().nullable(),
    attempts: model.hasMany(() => DunningAttempt, {
      mappedBy: "dunning_case",
    }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["subscription_id"],
    },
    {
      on: ["renewal_cycle_id"],
    },
    {
      on: ["renewal_order_id"],
    },
    {
      on: ["status"],
    },
    {
      on: ["next_retry_at"],
    },
    {
      on: ["last_attempt_at"],
    },
    {
      on: ["recovered_at"],
    },
    {
      on: ["closed_at"],
    },
    {
      on: ["status", "next_retry_at"],
    },
  ])

export default DunningCase
