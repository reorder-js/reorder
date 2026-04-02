import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { ACTIVITY_LOG_MODULE } from "../../src/modules/activity-log"
import type ActivityLogModuleService from "../../src/modules/activity-log/service"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../../src/modules/activity-log/types"
import {
  createAdminAuthHeaders,
  createSubscriptionSeed,
} from "../helpers/plan-offer-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscription logs endpoints", () => {
      it("lists subscription logs with filters and default descending chronology", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)

        const firstSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-LOG-API-001",
        })
        const secondSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-LOG-API-002",
        })

        await activityLogModule.createSubscriptionLogs({
          subscription_id: firstSubscription.id,
          customer_id: firstSubscription.customer_id,
          event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_1",
          subscription_reference: firstSubscription.reference,
          customer_name: firstSubscription.customer_snapshot?.full_name ?? null,
          product_title:
            firstSubscription.product_snapshot?.product_title ?? null,
          variant_title:
            firstSubscription.product_snapshot?.variant_title ?? null,
          reason: "Pause requested",
          dedupe_key: `test:${firstSubscription.id}:paused`,
          previous_state: {
            status: "active",
          },
          new_state: {
            status: "paused",
          },
          changed_fields: [
            {
              field: "status",
              before: "active",
              after: "paused",
            },
          ],
          metadata: {
            source: "integration-test",
          },
        } as any)

        await activityLogModule.createSubscriptionLogs({
          subscription_id: secondSubscription.id,
          customer_id: secondSubscription.customer_id,
          event_type: ActivityLogEventType.CANCELLATION_FINALIZED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_2",
          subscription_reference: secondSubscription.reference,
          customer_name: secondSubscription.customer_snapshot?.full_name ?? null,
          product_title:
            secondSubscription.product_snapshot?.product_title ?? null,
          variant_title:
            secondSubscription.product_snapshot?.variant_title ?? null,
          reason: "Final cancel",
          dedupe_key: `test:${secondSubscription.id}:finalized`,
          previous_state: {
            status: "requested",
          },
          new_state: {
            status: "canceled",
          },
          changed_fields: [
            {
              field: "status",
              before: "requested",
              after: "canceled",
            },
          ],
          metadata: {
            source: "integration-test",
          },
        } as any)

        const response = await api.get(
          `/admin/subscription-logs?limit=10&offset=0&event_type=${ActivityLogEventType.SUBSCRIPTION_PAUSED}&q=SUB-LOG-API-001`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(1)
        expect(response.data.subscription_logs).toHaveLength(1)
        expect(response.data.subscription_logs[0]).toMatchObject({
          subscription_id: firstSubscription.id,
          event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
          actor_type: ActivityLogActorType.USER,
          subscription: expect.objectContaining({
            reference: "SUB-LOG-API-001",
          }),
          reason: "Pause requested",
        })
      })

      it("returns subscription log detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-LOG-DETAIL-001",
        })

        const log = await activityLogModule.createSubscriptionLogs({
          subscription_id: subscription.id,
          customer_id: subscription.customer_id,
          event_type: ActivityLogEventType.RENEWAL_SUCCEEDED,
          actor_type: ActivityLogActorType.SCHEDULER,
          actor_id: null,
          subscription_reference: subscription.reference,
          customer_name: subscription.customer_snapshot?.full_name ?? null,
          product_title: subscription.product_snapshot?.product_title ?? null,
          variant_title: subscription.product_snapshot?.variant_title ?? null,
          reason: null,
          dedupe_key: `test:${subscription.id}:renewal-succeeded`,
          previous_state: {
            status: "scheduled",
          },
          new_state: {
            status: "succeeded",
          },
          changed_fields: [
            {
              field: "status",
              before: "scheduled",
              after: "succeeded",
            },
          ],
          metadata: {
            renewal_cycle_id: "ren_test_123",
          },
        } as any)

        const response = await api.get(
          `/admin/subscription-logs/${log.id}`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription_log).toMatchObject({
          id: log.id,
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.RENEWAL_SUCCEEDED,
          actor_type: ActivityLogActorType.SCHEDULER,
          subscription: expect.objectContaining({
            reference: "SUB-LOG-DETAIL-001",
          }),
          changed_fields: [
            expect.objectContaining({
              field: "status",
              before: "scheduled",
              after: "succeeded",
            }),
          ],
          metadata: {
            renewal_cycle_id: "ren_test_123",
          },
        })
      })

      it("returns subscription timeline scoped to one subscription", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-LOG-TIMELINE-001",
        })
        const otherSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-LOG-TIMELINE-002",
        })

        await activityLogModule.createSubscriptionLogs({
          subscription_id: subscription.id,
          customer_id: subscription.customer_id,
          event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_timeline",
          subscription_reference: subscription.reference,
          customer_name: subscription.customer_snapshot?.full_name ?? null,
          product_title: subscription.product_snapshot?.product_title ?? null,
          variant_title: subscription.product_snapshot?.variant_title ?? null,
          reason: "Pause timeline",
          dedupe_key: `test:${subscription.id}:timeline-paused`,
          previous_state: {
            status: "active",
          },
          new_state: {
            status: "paused",
          },
          changed_fields: [],
          metadata: null,
        } as any)

        await activityLogModule.createSubscriptionLogs({
          subscription_id: subscription.id,
          customer_id: subscription.customer_id,
          event_type: ActivityLogEventType.SUBSCRIPTION_RESUMED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_timeline",
          subscription_reference: subscription.reference,
          customer_name: subscription.customer_snapshot?.full_name ?? null,
          product_title: subscription.product_snapshot?.product_title ?? null,
          variant_title: subscription.product_snapshot?.variant_title ?? null,
          reason: "Resume timeline",
          dedupe_key: `test:${subscription.id}:timeline-resumed`,
          previous_state: {
            status: "paused",
          },
          new_state: {
            status: "active",
          },
          changed_fields: [],
          metadata: null,
        } as any)

        await activityLogModule.createSubscriptionLogs({
          subscription_id: otherSubscription.id,
          customer_id: otherSubscription.customer_id,
          event_type: ActivityLogEventType.SUBSCRIPTION_CANCELED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_other",
          subscription_reference: otherSubscription.reference,
          customer_name: otherSubscription.customer_snapshot?.full_name ?? null,
          product_title:
            otherSubscription.product_snapshot?.product_title ?? null,
          variant_title:
            otherSubscription.product_snapshot?.variant_title ?? null,
          reason: "Other subscription",
          dedupe_key: `test:${otherSubscription.id}:timeline-cancelled`,
          previous_state: {
            status: "active",
          },
          new_state: {
            status: "cancelled",
          },
          changed_fields: [],
          metadata: null,
        } as any)

        const response = await api.get(
          `/admin/subscriptions/${subscription.id}/logs?limit=10&offset=0`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription_logs).toHaveLength(2)
        expect(
          response.data.subscription_logs.map((record: { subscription_id: string }) => record.subscription_id)
        ).toEqual([subscription.id, subscription.id])
      })
    })
  },
})

jest.setTimeout(60 * 1000)
