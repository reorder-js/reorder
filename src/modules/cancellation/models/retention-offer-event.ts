import { model } from "@medusajs/framework/utils"
import CancellationCase from "./cancellation-case"
import {
  RetentionOfferDecisionStatus,
  RetentionOfferType,
} from "../types"

const RetentionOfferEvent = model
  .define("retention_offer_event", {
    id: model.id().primaryKey(),
    cancellation_case: model.belongsTo(() => CancellationCase, {
      mappedBy: "offer_events",
    }),
    offer_type: model.enum(RetentionOfferType),
    offer_payload: model.json().nullable(),
    decision_status: model
      .enum(RetentionOfferDecisionStatus)
      .default(RetentionOfferDecisionStatus.PROPOSED),
    decision_reason: model.text().nullable(),
    decided_at: model.dateTime().nullable(),
    decided_by: model.text().nullable(),
    applied_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["cancellation_case_id"],
    },
    {
      on: ["offer_type"],
    },
    {
      on: ["decision_status"],
    },
    {
      on: ["created_at"],
    },
    {
      on: ["cancellation_case_id", "created_at"],
    },
    {
      on: ["offer_type", "decision_status"],
    },
  ])

export default RetentionOfferEvent
