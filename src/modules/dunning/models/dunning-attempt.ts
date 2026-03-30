import { model } from "@medusajs/framework/utils"
import DunningCase from "./dunning-case"
import { DunningAttemptStatus } from "../types"

const DunningAttempt = model
  .define("dunning_attempt", {
    id: model.id().primaryKey(),
    dunning_case: model.belongsTo(() => DunningCase, {
      mappedBy: "attempts",
    }),
    attempt_no: model.number(),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    status: model
      .enum(DunningAttemptStatus)
      .default(DunningAttemptStatus.PROCESSING),
    error_code: model.text().nullable(),
    error_message: model.text().nullable(),
    payment_reference: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["dunning_case_id"],
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
      on: ["dunning_case_id", "attempt_no"],
      unique: true,
    },
  ])

export default DunningAttempt
