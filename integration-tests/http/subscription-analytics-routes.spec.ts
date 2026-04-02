import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CANCELLATION_MODULE } from "../../src/modules/cancellation"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "../../src/workflows"
import {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscription analytics endpoints", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      it("returns KPI payload with default group_by and UTC semantics", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await seedAnalyticsSnapshotScenario(container)

        const response = await api.get(
          "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-02T23:59:59.999Z",
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.filters).toMatchObject({
          group_by: "day",
          date_from: "2026-04-01T00:00:00.000Z",
          date_to: "2026-04-02T23:59:59.999Z",
          status: [],
          product_id: [],
          frequency: [],
        })
        expect(response.data.kpis).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: "mrr",
              value: 120,
              currency_code: "USD",
            }),
            expect.objectContaining({
              key: "churn_rate",
              value: 66.67,
            }),
            expect.objectContaining({
              key: "ltv",
              value: 180,
            }),
            expect.objectContaining({
              key: "active_subscriptions_count",
              value: 1,
            }),
          ])
        )
      })

      it("returns trends with filters and grouped buckets", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const scenario = await seedAnalyticsSnapshotScenario(container)

        const response = await api.get(
          `/admin/subscription-analytics/trends?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&group_by=week&status=active&product_id=${scenario.primaryProductId}&frequency=month:1`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.filters).toMatchObject({
          group_by: "week",
          status: ["active"],
          product_id: [scenario.primaryProductId],
          frequency: [{ interval: "month", value: 1 }],
        })

        const mrrSeries = response.data.series.find(
          (series: { metric: string }) => series.metric === "mrr"
        )
        const activeSeries = response.data.series.find(
          (series: { metric: string }) =>
            series.metric === "active_subscriptions_count"
        )

        expect(mrrSeries.points).toHaveLength(2)
        expect(mrrSeries.points[0]).toMatchObject({
          value: 120,
        })
        expect(mrrSeries.points[1]).toMatchObject({
          value: 130,
        })
        expect(activeSeries.points[0]).toMatchObject({
          value: 1,
        })
      })

      it("returns deterministic export payloads and honors active filters", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const scenario = await seedAnalyticsSnapshotScenario(container)

        const csvResponse = await api.get(
          `/admin/subscription-analytics/export?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&group_by=week&product_id=${scenario.primaryProductId}&format=csv`,
          { headers }
        )

        expect(csvResponse.status).toEqual(200)
        expect(csvResponse.data).toMatchObject({
          format: "csv",
          content_type: "text/csv",
          columns: [
            "bucket_start",
            "bucket_end",
            "mrr",
            "churn_rate",
            "ltv",
            "active_subscriptions_count",
          ],
        })
        expect(csvResponse.data.file_name).toMatch(
          /^subscription-analytics-\d{4}-\d{2}-\d{2}\.csv$/
        )
        expect(csvResponse.data.rows).toHaveLength(2)
        expect(csvResponse.data.rows[0]).toMatchObject({
          mrr: 120,
          active_subscriptions_count: 1,
        })

        const jsonResponse = await api.get(
          `/admin/subscription-analytics/export?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&status=active&product_id=${scenario.primaryProductId}&frequency=month:1&format=json`,
          { headers }
        )

        expect(jsonResponse.status).toEqual(200)
        expect(jsonResponse.data).toMatchObject({
          format: "json",
          content_type: "application/json",
        })
        expect(jsonResponse.data.filters).toMatchObject({
          status: ["active"],
          product_id: [scenario.primaryProductId],
          frequency: [{ interval: "month", value: 1 }],
        })
        expect(jsonResponse.data.rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              mrr: 120,
            }),
          ])
        )
      })

      it("validates ranges, unsupported timezone, frequency token, and max window", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.get(
            "/admin/subscription-analytics/kpis?date_from=2026-04-03T00:00:00.000Z&date_to=2026-04-02T23:59:59.999Z",
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.get(
            "/admin/subscription-analytics/trends?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-02T23:59:59.999Z&timezone=Europe/Warsaw",
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.get(
            "/admin/subscription-analytics/export?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-02T23:59:59.999Z&frequency=fortnight:1",
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.get(
            "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2028-04-05T23:59:59.999Z",
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)

async function seedAnalyticsSnapshotScenario(container: any) {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const originalGraph = query.graph.bind(query)
  const primaryProductId = `prod_analytics_primary_${Date.now()}`
  const secondaryProductId = `prod_analytics_secondary_${Date.now()}`

  const activePrimary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-ROUTE-001",
    status: SubscriptionStatus.ACTIVE,
    product_id: primaryProductId,
    frequency_value: 1,
  })
  const canceledPrimary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-ROUTE-002",
    status: SubscriptionStatus.ACTIVE,
    product_id: primaryProductId,
    frequency_value: 1,
  })
  const weeklySecondary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-ROUTE-003",
    status: SubscriptionStatus.ACTIVE,
    product_id: secondaryProductId,
    frequency_interval: "week" as any,
    frequency_value: 1,
  })

  const subscriptionModule = container.resolve<any>(SUBSCRIPTION_MODULE)

  await subscriptionModule.updateSubscriptions({
    id: activePrimary.id,
    started_at: new Date("2026-04-01T00:00:00.000Z"),
  } as any)
  await subscriptionModule.updateSubscriptions({
    id: canceledPrimary.id,
    started_at: new Date("2026-04-01T00:00:00.000Z"),
    cancel_effective_at: new Date("2026-04-02T12:00:00.000Z"),
  } as any)
  await subscriptionModule.updateSubscriptions({
    id: weeklySecondary.id,
    started_at: new Date("2026-04-08T00:00:00.000Z"),
  } as any)

  await createRenewalCycleSeed(container, {
    subscription_id: activePrimary.id,
    scheduled_for: new Date("2026-04-01T10:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_primary_day_1",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: activePrimary.id,
    scheduled_for: new Date("2026-04-09T10:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_primary_day_9",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: canceledPrimary.id,
    scheduled_for: new Date("2026-04-01T11:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_cancelled_day_1",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: weeklySecondary.id,
    scheduled_for: new Date("2026-04-08T11:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_weekly_day_8",
  })

  jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
    if (input.entity === "order") {
      return {
        data: [
          {
            id: "ord_analytics_primary_day_1",
            total: 120,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_primary_day_9",
            total: 130,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_cancelled_day_1",
            total: 60,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_weekly_day_8",
            total: 40,
            currency_code: "USD",
          },
        ],
      }
    }

    return originalGraph(input)
  })

  const cancellationModule = container.resolve<any>(CANCELLATION_MODULE)

  await cancellationModule.createCancellationCases({
    subscription_id: canceledPrimary.id,
    status: "canceled",
    reason: "Route analytics churn",
    reason_category: "price",
    final_outcome: "canceled",
    finalized_at: new Date("2026-04-02T12:00:00.000Z"),
    finalized_by: "route_test",
  } as any)

  await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
    input: {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-04-10T23:59:59.999Z",
      trigger_type: "manual",
      reason: "subscription_analytics_route_seed",
      correlation_id: "analytics-routes-seed",
    },
  })

  return {
    primaryProductId,
    secondaryProductId,
  }
}
