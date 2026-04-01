import { model } from "@medusajs/framework/utils"
import RetentionOfferEvent from "./retention-offer-event"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  CancellationRecommendedAction,
} from "../types"

const CancellationCase = model
  .define("cancellation_case", {
    id: model.id().primaryKey(),
    subscription_id: model.text(),
    status: model
      .enum(CancellationCaseStatus)
      .default(CancellationCaseStatus.REQUESTED),
    reason: model.text().nullable(),
    reason_category: model.enum(CancellationReasonCategory).nullable(),
    notes: model.text().nullable(),
    recommended_action: model
      .enum(CancellationRecommendedAction)
      .nullable(),
    final_outcome: model.enum(CancellationFinalOutcome).nullable(),
    finalized_at: model.dateTime().nullable(),
    finalized_by: model.text().nullable(),
    cancellation_effective_at: model.dateTime().nullable(),
    offer_events: model.hasMany(() => RetentionOfferEvent, {
      mappedBy: "cancellation_case",
    }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["subscription_id"],
    },
    {
      on: ["status"],
    },
    {
      on: ["final_outcome"],
    },
    {
      on: ["reason_category"],
    },
    {
      on: ["created_at"],
    },
    {
      on: ["subscription_id", "status"],
    },
    {
      on: ["status", "created_at"],
    },
  ])

export default CancellationCase
