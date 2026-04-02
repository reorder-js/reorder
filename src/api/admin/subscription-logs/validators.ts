import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../../../modules/activity-log/types"

const optionalIsoDateTime = z.string().datetime().optional()

export const GetAdminSubscriptionLogsSchema = createFindParams({
  offset: 0,
  limit: 20,
}).extend({
  q: z.string().optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  subscription_id: z.string().optional(),
  customer_id: z.string().optional(),
  event_type: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(z.nativeEnum(ActivityLogEventType)).optional()),
  actor_type: z.preprocess((value) => {
    if (typeof value === "string") {
      return [value]
    }

    return value
  }, z.array(z.nativeEnum(ActivityLogActorType)).optional()),
  date_from: optionalIsoDateTime,
  date_to: optionalIsoDateTime,
})

export type GetAdminSubscriptionLogsSchemaType = z.infer<
  typeof GetAdminSubscriptionLogsSchema
>

export const GetAdminSubscriptionLogSchema = createFindParams().extend({})

export type GetAdminSubscriptionLogSchemaType = z.infer<
  typeof GetAdminSubscriptionLogSchema
>
