import { model } from "@medusajs/framework/utils"
import RenewalAttempt from "./renewal-attempt"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../types"

const RenewalCycle = model
  .define("renewal_cycle", {
    id: model.id().primaryKey(),
    subscription_id: model.text(),
    scheduled_for: model.dateTime(),
    processed_at: model.dateTime().nullable(),
    status: model
      .enum(RenewalCycleStatus)
      .default(RenewalCycleStatus.SCHEDULED),
    approval_required: model.boolean().default(false),
    approval_status: model.enum(RenewalApprovalStatus).nullable(),
    approval_decided_at: model.dateTime().nullable(),
    approval_decided_by: model.text().nullable(),
    approval_reason: model.text().nullable(),
    generated_order_id: model.text().nullable(),
    applied_pending_update_data: model.json().nullable(),
    last_error: model.text().nullable(),
    attempt_count: model.number().default(0),
    attempts: model.hasMany(() => RenewalAttempt, {
      mappedBy: "renewal_cycle",
    }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["subscription_id"],
    },
    {
      on: ["scheduled_for"],
    },
    {
      on: ["status"],
    },
    {
      on: ["approval_required"],
    },
    {
      on: ["approval_status"],
    },
    {
      on: ["generated_order_id"],
    },
    {
      on: ["scheduled_for", "status"],
    },
  ])

export default RenewalCycle
