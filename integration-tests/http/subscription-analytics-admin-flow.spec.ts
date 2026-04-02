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
    describe("admin analytics flow", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      it("covers filtered KPI and trend reads plus export on demand", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const scenario = await seedAnalyticsAdminFlowScenario(container)

        const initialKpisResponse = await api.get(
          "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z",
          { headers }
        )

        expect(initialKpisResponse.status).toEqual(200)
        expect(initialKpisResponse.data.kpis).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: "mrr",
              value: 303.33,
            }),
            expect.objectContaining({
              key: "active_subscriptions_count",
              value: 2,
            }),
          ])
        )

        const filteredTrendsResponse = await api.get(
          `/admin/subscription-analytics/trends?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&group_by=week&status=active&product_id=${scenario.primaryProductId}&frequency=month:1`,
          { headers }
        )

        expect(filteredTrendsResponse.status).toEqual(200)
        expect(filteredTrendsResponse.data.filters).toMatchObject({
          group_by: "week",
          status: ["active"],
          product_id: [scenario.primaryProductId],
          frequency: [{ interval: "month", value: 1 }],
        })

        const filteredMrrSeries = filteredTrendsResponse.data.series.find(
          (series: { metric: string }) => series.metric === "mrr"
        )

        expect(filteredMrrSeries.points).toHaveLength(2)
        expect(filteredMrrSeries.points[0]).toMatchObject({ value: 120 })
        expect(filteredMrrSeries.points[1]).toMatchObject({ value: 130 })

        const csvExportResponse = await api.get(
          `/admin/subscription-analytics/export?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&group_by=week&status=active&product_id=${scenario.primaryProductId}&frequency=month:1&format=csv`,
          { headers }
        )

        expect(csvExportResponse.status).toEqual(200)
        expect(csvExportResponse.data).toMatchObject({
          format: "csv",
          content_type: "text/csv",
          filters: {
            status: ["active"],
            product_id: [scenario.primaryProductId],
            frequency: [{ interval: "month", value: 1 }],
          },
        })
        expect(csvExportResponse.data.rows).toHaveLength(2)

        const jsonExportResponse = await api.get(
          `/admin/subscription-analytics/export?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&group_by=week&status=active&product_id=${scenario.primaryProductId}&frequency=month:1&format=json`,
          { headers }
        )

        expect(jsonExportResponse.status).toEqual(200)
        expect(jsonExportResponse.data).toMatchObject({
          format: "json",
          content_type: "application/json",
        })
        expect(jsonExportResponse.data.rows).toEqual(csvExportResponse.data.rows)

        const repeatedKpisResponse = await api.get(
          "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z",
          { headers }
        )

        expect(repeatedKpisResponse.status).toEqual(200)
        expect(repeatedKpisResponse.data.kpis).toEqual(
          initialKpisResponse.data.kpis
        )
      })

      it("returns empty analytics payloads for filters with no matching data", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await seedAnalyticsAdminFlowScenario(container)

        const emptyKpisResponse = await api.get(
          "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&product_id=prod_non_existing",
          { headers }
        )

        expect(emptyKpisResponse.status).toEqual(200)
        expect(emptyKpisResponse.data.kpis).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: "mrr",
              value: null,
            }),
            expect.objectContaining({
              key: "churn_rate",
              value: 0,
            }),
            expect.objectContaining({
              key: "ltv",
              value: null,
            }),
            expect.objectContaining({
              key: "active_subscriptions_count",
              value: 0,
            }),
          ])
        )

        const emptyTrendsResponse = await api.get(
          "/admin/subscription-analytics/trends?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&product_id=prod_non_existing",
          { headers }
        )

        expect(emptyTrendsResponse.status).toEqual(200)
        expect(
          emptyTrendsResponse.data.series.every(
            (series: { points: unknown[] }) => series.points.length === 0
          )
        ).toBe(true)
      })

      it("surfaces validation errors for unsupported query combinations", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.get(
            "/admin/subscription-analytics/trends?date_from=2026-04-10T00:00:00.000Z&date_to=2026-04-01T23:59:59.999Z",
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.get(
            "/admin/subscription-analytics/kpis?date_from=2026-04-01T00:00:00.000Z&date_to=2026-04-10T23:59:59.999Z&timezone=Europe/Warsaw",
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

async function seedAnalyticsAdminFlowScenario(container: any) {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const originalGraph = query.graph.bind(query)
  const primaryProductId = `prod_analytics_flow_primary_${Date.now()}`
  const secondaryProductId = `prod_analytics_flow_secondary_${Date.now()}`

  const activePrimary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-FLOW-001",
    status: SubscriptionStatus.ACTIVE,
    product_id: primaryProductId,
    frequency_value: 1,
  })
  const canceledPrimary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-FLOW-002",
    status: SubscriptionStatus.ACTIVE,
    product_id: primaryProductId,
    frequency_value: 1,
  })
  const weeklySecondary = await createSubscriptionSeed(container, {
    reference: "SUB-AN-FLOW-003",
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
    generated_order_id: "ord_analytics_flow_primary_day_1",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: activePrimary.id,
    scheduled_for: new Date("2026-04-09T10:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_flow_primary_day_9",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: canceledPrimary.id,
    scheduled_for: new Date("2026-04-01T11:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_flow_cancelled_day_1",
  })
  await createRenewalCycleSeed(container, {
    subscription_id: weeklySecondary.id,
    scheduled_for: new Date("2026-04-08T11:00:00.000Z"),
    status: RenewalCycleStatus.SUCCEEDED,
    generated_order_id: "ord_analytics_flow_weekly_day_8",
  })

  jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
    if (input.entity === "order") {
      return {
        data: [
          {
            id: "ord_analytics_flow_primary_day_1",
            total: 120,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_flow_primary_day_9",
            total: 130,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_flow_cancelled_day_1",
            total: 60,
            currency_code: "USD",
          },
          {
            id: "ord_analytics_flow_weekly_day_8",
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
    reason: "Admin flow analytics churn",
    reason_category: "price",
    final_outcome: "canceled",
    finalized_at: new Date("2026-04-02T12:00:00.000Z"),
    finalized_by: "admin_flow_test",
  } as any)

  await rebuildAnalyticsDailySnapshotsWorkflow(container).run({
    input: {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-04-10T23:59:59.999Z",
      trigger_type: "manual",
      reason: "subscription_analytics_admin_flow_seed",
      correlation_id: "analytics-admin-flow-seed",
    },
  })

  return {
    primaryProductId,
    secondaryProductId,
  }
}
