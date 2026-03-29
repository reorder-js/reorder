import { model } from "@medusajs/framework/utils"
import RenewalCycle from "./renewal-cycle"
import { RenewalAttemptStatus } from "../types"

const RenewalAttempt = model
  .define("renewal_attempt", {
    id: model.id().primaryKey(),
    renewal_cycle: model.belongsTo(() => RenewalCycle, {
      mappedBy: "attempts",
    }),
    attempt_no: model.number(),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    status: model
      .enum(RenewalAttemptStatus)
      .default(RenewalAttemptStatus.PROCESSING),
    error_code: model.text().nullable(),
    error_message: model.text().nullable(),
    payment_reference: model.text().nullable(),
    order_id: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["renewal_cycle_id"],
    },
    {
      on: ["attempt_no"],
    },
    {
      on: ["status"],
    },
    {
      on: ["started_at"],
    },
    {
      on: ["finished_at"],
    },
    {
      on: ["renewal_cycle_id", "attempt_no"],
      unique: true,
    },
  ])

export default RenewalAttempt
