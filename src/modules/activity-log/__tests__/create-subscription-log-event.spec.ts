import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { ACTIVITY_LOG_MODULE } from ".."
import SubscriptionLog from "../models/subscription-log"
import ActivityLogModuleService from "../service"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../types"
import { normalizeActivityLogEvent } from "../utils/normalize-log-event"
import {
  compensateCreateSubscriptionLogEventStep,
  createSubscriptionLogEventStepHandler,
} from "../../../workflows/steps/create-subscription-log-event"

moduleIntegrationTestRunner<ActivityLogModuleService>({
  moduleName: ACTIVITY_LOG_MODULE,
  moduleModels: [SubscriptionLog],
  resolve: "./src/modules/activity-log",
  testSuite: ({ service, container }) => {
    describe("createSubscriptionLogEventStep", () => {
      const stepContext = {
        container: {
          resolve(key: string) {
            if (key !== ACTIVITY_LOG_MODULE) {
              throw new Error(`Unexpected module resolution: ${key}`)
            }

            return service
          },
        },
      }

      it("creates a subscription log record when dedupe_key does not exist", async () => {
        const logEvent = normalizeActivityLogEvent({
          subscription_id: "sub_001",
          customer_id: "cus_001",
          event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "user_001",
          display: {
            subscription_reference: "SUB-001",
            customer_name: "Jane Doe",
            product_title: "Coffee Club",
            variant_title: "Monthly",
          },
          previous_state: {
            status: "active",
          },
          new_state: {
            status: "paused",
          },
          reason: "customer requested pause",
          metadata: {
            source: "admin",
          },
          dedupe: {
            scope: "subscription",
            target_id: "sub_001",
            qualifier: "2026-04-01T10:00:00.000Z",
          },
        })

        const result = await createSubscriptionLogEventStepHandler(
          { log_event: logEvent },
          stepContext as any
        )

        expect(result).toBeDefined()

        const created = await service.listSubscriptionLogs({
          dedupe_key: logEvent.dedupe_key,
        } as any)

        expect(created).toHaveLength(1)
        expect(created[0].subscription_id).toBe("sub_001")
      })

      it("does not create a duplicate record for the same dedupe_key", async () => {
        const logEvent = normalizeActivityLogEvent({
          subscription_id: "sub_002",
          customer_id: "cus_002",
          event_type: ActivityLogEventType.RENEWAL_FAILED,
          actor_type: ActivityLogActorType.SYSTEM,
          display: {
            subscription_reference: "SUB-002",
          },
          metadata: {
            renewal_cycle_id: "renewal_002",
            source: "workflow",
          },
          dedupe: {
            scope: "renewal",
            target_id: "renewal_002",
          },
        })

        await createSubscriptionLogEventStepHandler(
          { log_event: logEvent },
          stepContext as any
        )
        await createSubscriptionLogEventStepHandler(
          { log_event: logEvent },
          stepContext as any
        )

        const records = await service.listSubscriptionLogs({
          dedupe_key: logEvent.dedupe_key,
        } as any)

        expect(records).toHaveLength(1)
      })

      it("deletes only records created by the current execution during compensation", async () => {
        const createdEvent = normalizeActivityLogEvent({
          subscription_id: "sub_003",
          event_type: ActivityLogEventType.CANCELLATION_FINALIZED,
          actor_type: ActivityLogActorType.USER,
          display: {
            subscription_reference: "SUB-003",
          },
          dedupe: {
            scope: "cancellation",
            target_id: "case_003",
          },
        })

        await createSubscriptionLogEventStepHandler(
          { log_event: createdEvent },
          stepContext as any
        )

        const createdRecord = await service.listSubscriptionLogs({
          dedupe_key: createdEvent.dedupe_key,
        } as any)

        expect(createdRecord).toHaveLength(1)

        await compensateCreateSubscriptionLogEventStep(
          {
            action: "created",
            subscription_log_id: createdRecord[0].id,
          },
          stepContext as any
        )

        const afterDelete = await service.listSubscriptionLogs({
          dedupe_key: createdEvent.dedupe_key,
        } as any)

        expect(afterDelete).toHaveLength(0)
      })

      it("does not delete an existing record during compensation", async () => {
        const logEvent = normalizeActivityLogEvent({
          subscription_id: "sub_004",
          event_type: ActivityLogEventType.DUNNING_RECOVERED,
          actor_type: ActivityLogActorType.USER,
          display: {
            subscription_reference: "SUB-004",
          },
          dedupe: {
            scope: "dunning",
            target_id: "dunning_004",
          },
        })

        await service.createSubscriptionLogs(logEvent as any)

        await compensateCreateSubscriptionLogEventStep(
          {
            action: "existing",
          },
          stepContext as any
        )

        const records = await service.listSubscriptionLogs({
          dedupe_key: logEvent.dedupe_key,
        } as any)

        expect(records).toHaveLength(1)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
