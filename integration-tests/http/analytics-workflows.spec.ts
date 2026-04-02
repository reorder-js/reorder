import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ANALYTICS_MODULE } from "../../src/modules/analytics"
import type AnalyticsModuleService from "../../src/modules/analytics/service"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "../../src/workflows"
import {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"

type AnalyticsSnapshotRow = {
  id: string
  metric_date: Date | string
  subscription_id: string
  status: SubscriptionStatus
  is_active: boolean
  active_subscriptions_count: number
  churned_subscriptions_count: number
  mrr_amount: number | string | null
  metadata?: Record<string, unknown> | null
}

type LockingServiceLike = {
  execute<T>(
    keys: string | string[],
    job: () => Promise<T>,
    args?: {
      timeout?: number
      provider?: string
    }
  ): Promise<T>
}

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("analytics rebuild workflow integration", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      it("rebuilds snapshot rows for a day range and reruns idempotently", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const originalGraph = query.graph.bind(query)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-AN-WF-001",
          status: SubscriptionStatus.ACTIVE,
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          started_at: new Date("2026-04-01T00:00:00.000Z"),
        } as any)

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          scheduled_for: new Date("2026-04-01T10:00:00.000Z"),
          status: RenewalCycleStatus.SUCCEEDED,
          generated_order_id: "ord_analytics_rerun",
        })

        expect(cycle.generated_order_id).toEqual("ord_analytics_rerun")

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "order") {
            return {
              data: [
                {
                  id: "ord_analytics_rerun",
                  total: 129,
                  currency_code: "USD",
                },
              ],
            }
          }

          return originalGraph(input)
        })

        const firstRun = await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
          input: {
            date_from: "2026-04-01T00:00:00.000Z",
            date_to: "2026-04-02T23:59:59.999Z",
            trigger_type: "manual",
            reason: "integration_test_first_run",
            correlation_id: "analytics-test-rerun-1",
          },
        })

        expect(firstRun.result).toMatchObject({
          processed_days: 2,
          blocked_days: [],
          failed_days: [],
          processed_subscriptions: 2,
          upserted_rows: 2,
        })

        const firstRows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(firstRows).toHaveLength(2)
        expect(normalizeRows(firstRows)).toEqual([
          {
            metric_date: "2026-04-01T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
            is_active: true,
            active_subscriptions_count: 1,
            churned_subscriptions_count: 0,
            mrr_amount: 129,
          },
          {
            metric_date: "2026-04-02T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
            is_active: true,
            active_subscriptions_count: 1,
            churned_subscriptions_count: 0,
            mrr_amount: 129,
          },
        ])

        const secondRun = await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
          input: {
            date_from: "2026-04-01T00:00:00.000Z",
            date_to: "2026-04-02T23:59:59.999Z",
            trigger_type: "manual",
            reason: "integration_test_second_run",
            correlation_id: "analytics-test-rerun-2",
          },
        })

        expect(secondRun.result).toMatchObject({
          processed_days: 2,
          blocked_days: [],
          failed_days: [],
          processed_subscriptions: 2,
          upserted_rows: 2,
        })

        const secondRows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(secondRows).toHaveLength(2)
        expect(normalizeRows(secondRows)).toEqual(normalizeRows(firstRows))
      })

      it("uses full replacement semantics when source facts change for the same day", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-AN-WF-002",
          status: SubscriptionStatus.ACTIVE,
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          started_at: new Date("2026-04-02T00:00:00.000Z"),
        } as any)

        await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
          input: {
            date_from: "2026-04-02T00:00:00.000Z",
            date_to: "2026-04-02T23:59:59.999Z",
            trigger_type: "manual",
            reason: "replacement_before",
            correlation_id: "analytics-test-replacement-before",
          },
        })

        const initialRows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(initialRows).toHaveLength(1)
        expect(normalizeRows(initialRows)).toEqual([
          {
            metric_date: "2026-04-02T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
            is_active: true,
            active_subscriptions_count: 1,
            churned_subscriptions_count: 0,
            mrr_amount: null,
          },
        ])

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          status: SubscriptionStatus.PAUSED,
          paused_at: new Date("2026-04-02T08:00:00.000Z"),
        } as any)

        await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
          input: {
            date_from: "2026-04-02T00:00:00.000Z",
            date_to: "2026-04-02T23:59:59.999Z",
            trigger_type: "manual",
            reason: "replacement_after",
            correlation_id: "analytics-test-replacement-after",
          },
        })

        const replacedRows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(replacedRows).toHaveLength(1)
        expect(normalizeRows(replacedRows)).toEqual([
          {
            metric_date: "2026-04-02T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.PAUSED,
            is_active: false,
            active_subscriptions_count: 0,
            churned_subscriptions_count: 0,
            mrr_amount: null,
          },
        ])
      })

      it("reports blocked and failed days without corrupting completed days", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const originalGraph = query.graph.bind(query)
        const originalResolve = container.resolve.bind(container)
        const originalLocking = originalResolve(Modules.LOCKING) as LockingServiceLike

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-AN-WF-003",
          status: SubscriptionStatus.ACTIVE,
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          started_at: new Date("2026-04-01T00:00:00.000Z"),
        } as any)

        jest.spyOn(container, "resolve").mockImplementation((key: any) => {
          if (key === Modules.LOCKING) {
            return {
              execute: async <T>(
                keys: string | string[],
                job: () => Promise<T>,
                args?: {
                  timeout?: number
                  provider?: string
                }
              ) => {
                const normalizedKeys = Array.isArray(keys) ? keys : [keys]
                const firstKey = normalizedKeys[0]

                if (firstKey === "analytics:snapshots:2026-04-02") {
                  throw new Error("Timed out acquiring lock")
                }

                return originalLocking.execute(keys, job, args)
              },
            } as LockingServiceLike
          }

          return originalResolve(key as any)
        })

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (
            input.entity === "subscription" &&
            input.filters?.started_at?.$lte === "2026-04-03T23:59:59.999Z"
          ) {
            throw new Error("Synthetic analytics failure")
          }

          return originalGraph(input)
        })

        const { result } = await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
          input: {
            date_from: "2026-04-01T00:00:00.000Z",
            date_to: "2026-04-03T23:59:59.999Z",
            trigger_type: "manual",
            reason: "blocked_and_failed_days",
            correlation_id: "analytics-test-blocked-failed",
          },
        })

        expect(result).toMatchObject({
          processed_days: 2,
          processed_subscriptions: 2,
          upserted_rows: 2,
          blocked_days: [],
          failed_days: ["2026-04-03T00:00:00.000Z"],
        })

        const rows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(rows).toHaveLength(2)
        expect(normalizeRows(rows)).toEqual([
          {
            metric_date: "2026-04-01T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
            is_active: true,
            active_subscriptions_count: 1,
            churned_subscriptions_count: 0,
            mrr_amount: null,
          },
          {
            metric_date: "2026-04-02T00:00:00.000Z",
            subscription_id: subscription.id,
            status: SubscriptionStatus.ACTIVE,
            is_active: true,
            active_subscriptions_count: 1,
            churned_subscriptions_count: 0,
            mrr_amount: null,
          },
        ])
      })

      it("reuses the shared workflow from the manual rebuild route", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-AN-WF-004",
          status: SubscriptionStatus.ACTIVE,
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          started_at: new Date("2026-04-02T00:00:00.000Z"),
        } as any)

        const response = await api.post(
          "/admin/subscription-analytics/rebuild",
          {
            date_from: "2026-04-02T00:00:00.000Z",
            date_to: "2026-04-02T23:59:59.999Z",
            reason: "manual_route_rebuild",
          },
          {
            headers,
          }
        )

        expect(response.status).toEqual(200)
        expect(response.data.rebuild).toMatchObject({
          requested_days: 1,
          outcome: "completed",
          processed_days: 1,
          blocked_days: [],
          failed_days: [],
        })

        const rows = await listAnalyticsRows(container, {
          subscription_id: subscription.id,
        })

        expect(rows).toHaveLength(1)
        expect(rows[0].metadata).toEqual(
          expect.objectContaining({
            trigger_type: "manual",
            reason: "manual_route_rebuild",
          })
        )
      })
    })
  },
})

jest.setTimeout(60 * 1000)

async function listAnalyticsRows(
  container: MedusaContainer,
  filters: Record<string, unknown>
) {
  const analyticsModule =
    container.resolve<AnalyticsModuleService>(ANALYTICS_MODULE)

  const rows = (await analyticsModule.listSubscriptionMetricsDailies(
    filters as any
  )) as AnalyticsSnapshotRow[]

  return rows.sort((left, right) => {
    const leftDate = new Date(left.metric_date).toISOString()
    const rightDate = new Date(right.metric_date).toISOString()

    if (leftDate === rightDate) {
      return left.subscription_id.localeCompare(right.subscription_id)
    }

    return leftDate.localeCompare(rightDate)
  })
}

function normalizeRows(rows: AnalyticsSnapshotRow[]) {
  return rows.map((row) => ({
    metric_date: new Date(row.metric_date).toISOString(),
    subscription_id: row.subscription_id,
    status: row.status,
    is_active: row.is_active,
    active_subscriptions_count: row.active_subscriptions_count,
    churned_subscriptions_count: row.churned_subscriptions_count,
    mrr_amount:
      row.mrr_amount === null || row.mrr_amount === undefined
        ? null
        : Number(row.mrr_amount),
  }))
}
