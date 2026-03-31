import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IPaymentModuleService } from "@medusajs/framework/types"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
} from "../../src/modules/dunning/types"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  createAdminAuthHeaders,
  createDunningAttemptSeed,
  createDunningCaseSeed,
  createRenewalCycleSeed,
  createSubscriptionSeed,
  defaultRetrySchedule,
} from "../helpers/dunning-fixtures"

const mockCreateOrUpdateOrderPaymentCollectionRun = jest.fn()
const mockCreatePaymentSessionsRun = jest.fn()

jest.mock("@medusajs/medusa/core-flows", () => {
  const actual = jest.requireActual("@medusajs/medusa/core-flows")

  return {
    ...actual,
    createOrUpdateOrderPaymentCollectionWorkflow: () => ({
      run: mockCreateOrUpdateOrderPaymentCollectionRun,
    }),
    createPaymentSessionsWorkflow: () => ({
      run: mockCreatePaymentSessionsRun,
    }),
  }
})

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin dunning endpoints", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      it("lists dunning cases and returns detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-API-001",
          status: SubscriptionStatus.PAST_DUE,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const dunningCase = await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: cycle.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 1,
          last_payment_error_code: "card_declined",
          last_payment_error_message: "Declined",
        })
        await createDunningAttemptSeed(container, {
          dunning_case_id: dunningCase.id,
          attempt_no: 1,
          status: DunningAttemptStatus.FAILED,
          finished_at: new Date(),
          error_code: "card_declined",
          error_message: "Declined",
        })

        const listResponse = await api.get("/admin/dunning?limit=10&offset=0", {
          headers,
        })
        const detailResponse = await api.get(`/admin/dunning/${dunningCase.id}`, {
          headers,
        })

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.count).toBeGreaterThanOrEqual(1)
        expect(listResponse.data.dunning_cases[0]).toHaveProperty("subscription")
        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.dunning_case.id).toEqual(dunningCase.id)
        expect(detailResponse.data.dunning_case.attempts).toHaveLength(1)
      })

      it("covers admin flow from list to detail to retry-now to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const originalGraph = query.graph.bind(query)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-ADMIN-FLOW-001",
          status: SubscriptionStatus.PAST_DUE,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
          generated_order_id: "ord_dun_admin_flow_retry",
        })
        const dunningCase = await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: cycle.id,
          renewal_order_id: "ord_dun_admin_flow_retry",
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 0,
          max_attempts: 3,
          retry_schedule: defaultRetrySchedule,
          next_retry_at: new Date(Date.now() + 86_400_000),
          last_payment_error_code: "card_declined",
          last_payment_error_message: "Declined in admin flow",
        })

        const listResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: dunningCase.id,
              status: DunningCaseStatus.RETRY_SCHEDULED,
              subscription: expect.objectContaining({
                reference: "SUB-DUN-ADMIN-FLOW-001",
              }),
            }),
          ])
        )

        const detailResponse = await api.get(`/admin/dunning/${dunningCase.id}`, {
          headers,
        })

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.dunning_case).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 0,
          subscription: expect.objectContaining({
            reference: "SUB-DUN-ADMIN-FLOW-001",
          }),
        })

        mockCreateOrUpdateOrderPaymentCollectionRun.mockResolvedValue({
          result: [{ id: "paycol_admin_flow" }],
        })
        mockCreatePaymentSessionsRun.mockResolvedValue({
          result: { id: "payses_admin_flow", context: {}, status: "pending" },
        })

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "order") {
            return {
              data: [{ id: "ord_dun_admin_flow_retry", total: 250 }],
            }
          }

          return originalGraph(input)
        })
        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockResolvedValue({ id: "pay_admin_flow", amount: 250 } as any)
        jest
          .spyOn(paymentModule, "capturePayment")
          .mockResolvedValue({ id: "pay_admin_flow" } as any)

        const retryResponse = await api.post(
          `/admin/dunning/${dunningCase.id}/retry-now`,
          {
            reason: "admin flow retry",
          },
          { headers }
        )

        expect(retryResponse.status).toEqual(200)
        expect(retryResponse.data.dunning_case).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RECOVERED,
          attempt_count: 1,
          recovery_reason: "payment_recovered",
        })

        const refreshedDetailResponse = await api.get(
          `/admin/dunning/${dunningCase.id}`,
          {
            headers,
          }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.dunning_case).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RECOVERED,
          attempt_count: 1,
          recovery_reason: "payment_recovered",
        })
        expect(refreshedDetailResponse.data.dunning_case.attempts).toHaveLength(1)
        expect(refreshedDetailResponse.data.dunning_case.attempts[0]).toMatchObject({
          attempt_no: 1,
          status: DunningAttemptStatus.SUCCEEDED,
        })

        const refreshedListResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: dunningCase.id,
              status: DunningCaseStatus.RECOVERED,
              attempt_count: 1,
            }),
          ])
        )
      })

      it("retries now and returns updated detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const originalGraph = query.graph.bind(query)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-API-002",
          status: SubscriptionStatus.PAST_DUE,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
          generated_order_id: "ord_dun_api_retry",
        })
        const dunningCase = await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: cycle.id,
          renewal_order_id: "ord_dun_api_retry",
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 0,
          max_attempts: 3,
          retry_schedule: defaultRetrySchedule,
          next_retry_at: new Date(Date.now() + 86_400_000),
        })

        mockCreateOrUpdateOrderPaymentCollectionRun.mockResolvedValue({
          result: [{ id: "paycol_api" }],
        })
        mockCreatePaymentSessionsRun.mockResolvedValue({
          result: { id: "payses_api", context: {}, status: "pending" },
        })

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "order") {
            return {
              data: [{ id: "ord_dun_api_retry", total: 250 }],
            }
          }

          return originalGraph(input)
        })
        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockResolvedValue({ id: "pay_api", amount: 250 } as any)
        jest
          .spyOn(paymentModule, "capturePayment")
          .mockResolvedValue({ id: "pay_api" } as any)

        const response = await api.post(
          `/admin/dunning/${dunningCase.id}/retry-now`,
          {
            reason: "manual retry",
          },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.dunning_case).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RECOVERED,
        })
      })

      it("marks a case as recovered and unrecovered through admin endpoints", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const recoveredSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-API-003",
          status: SubscriptionStatus.PAST_DUE,
        })
        const recoveredCycle = await createRenewalCycleSeed(container, {
          subscription_id: recoveredSubscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const recoveredCase = await createDunningCaseSeed(container, {
          subscription_id: recoveredSubscription.id,
          renewal_cycle_id: recoveredCycle.id,
          status: DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
          next_retry_at: null,
        })

        const markRecoveredResponse = await api.post(
          `/admin/dunning/${recoveredCase.id}/mark-recovered`,
          {
            reason: "paid via support",
          },
          { headers }
        )

        expect(markRecoveredResponse.status).toEqual(200)
        expect(markRecoveredResponse.data.dunning_case).toMatchObject({
          id: recoveredCase.id,
          status: DunningCaseStatus.RECOVERED,
          recovery_reason: "marked_recovered_by_admin",
        })

        const unrecoveredSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-API-004",
          status: SubscriptionStatus.PAST_DUE,
        })
        const unrecoveredCycle = await createRenewalCycleSeed(container, {
          subscription_id: unrecoveredSubscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const unrecoveredCase = await createDunningCaseSeed(container, {
          subscription_id: unrecoveredSubscription.id,
          renewal_cycle_id: unrecoveredCycle.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
        })

        const markUnrecoveredResponse = await api.post(
          `/admin/dunning/${unrecoveredCase.id}/mark-unrecovered`,
          {
            reason: "customer refused update",
          },
          { headers }
        )

        expect(markUnrecoveredResponse.status).toEqual(200)
        expect(markUnrecoveredResponse.data.dunning_case).toMatchObject({
          id: unrecoveredCase.id,
          status: DunningCaseStatus.UNRECOVERED,
          recovery_reason: "marked_unrecovered_by_admin",
        })
      })

      it("covers admin flow from list to detail to manual resolution to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const recoveredSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-ADMIN-FLOW-002",
          status: SubscriptionStatus.PAST_DUE,
        })
        const recoveredCycle = await createRenewalCycleSeed(container, {
          subscription_id: recoveredSubscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const recoveredCase = await createDunningCaseSeed(container, {
          subscription_id: recoveredSubscription.id,
          renewal_cycle_id: recoveredCycle.id,
          status: DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
          next_retry_at: null,
        })

        const recoveredListResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-002",
          {
            headers,
          }
        )

        expect(recoveredListResponse.status).toEqual(200)
        expect(recoveredListResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: recoveredCase.id,
              status: DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
            }),
          ])
        )

        const recoveredDetailResponse = await api.get(
          `/admin/dunning/${recoveredCase.id}`,
          {
            headers,
          }
        )

        expect(recoveredDetailResponse.status).toEqual(200)
        expect(recoveredDetailResponse.data.dunning_case.id).toEqual(
          recoveredCase.id
        )

        const markRecoveredResponse = await api.post(
          `/admin/dunning/${recoveredCase.id}/mark-recovered`,
          {
            reason: "resolved in admin flow",
          },
          { headers }
        )

        expect(markRecoveredResponse.status).toEqual(200)
        expect(markRecoveredResponse.data.dunning_case).toMatchObject({
          id: recoveredCase.id,
          status: DunningCaseStatus.RECOVERED,
          recovery_reason: "marked_recovered_by_admin",
        })

        const refreshedRecoveredDetailResponse = await api.get(
          `/admin/dunning/${recoveredCase.id}`,
          {
            headers,
          }
        )

        expect(refreshedRecoveredDetailResponse.status).toEqual(200)
        expect(refreshedRecoveredDetailResponse.data.dunning_case).toMatchObject({
          id: recoveredCase.id,
          status: DunningCaseStatus.RECOVERED,
          recovery_reason: "marked_recovered_by_admin",
        })

        const refreshedRecoveredListResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-002",
          {
            headers,
          }
        )

        expect(refreshedRecoveredListResponse.status).toEqual(200)
        expect(refreshedRecoveredListResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: recoveredCase.id,
              status: DunningCaseStatus.RECOVERED,
            }),
          ])
        )

        const unrecoveredSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-ADMIN-FLOW-003",
          status: SubscriptionStatus.PAST_DUE,
        })
        const unrecoveredCycle = await createRenewalCycleSeed(container, {
          subscription_id: unrecoveredSubscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const unrecoveredCase = await createDunningCaseSeed(container, {
          subscription_id: unrecoveredSubscription.id,
          renewal_cycle_id: unrecoveredCycle.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
        })

        const unrecoveredListResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-003",
          {
            headers,
          }
        )

        expect(unrecoveredListResponse.status).toEqual(200)
        expect(unrecoveredListResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: unrecoveredCase.id,
              status: DunningCaseStatus.RETRY_SCHEDULED,
            }),
          ])
        )

        const unrecoveredDetailResponse = await api.get(
          `/admin/dunning/${unrecoveredCase.id}`,
          {
            headers,
          }
        )

        expect(unrecoveredDetailResponse.status).toEqual(200)
        expect(unrecoveredDetailResponse.data.dunning_case.id).toEqual(
          unrecoveredCase.id
        )

        const markUnrecoveredResponse = await api.post(
          `/admin/dunning/${unrecoveredCase.id}/mark-unrecovered`,
          {
            reason: "closed in admin flow",
          },
          { headers }
        )

        expect(markUnrecoveredResponse.status).toEqual(200)
        expect(markUnrecoveredResponse.data.dunning_case).toMatchObject({
          id: unrecoveredCase.id,
          status: DunningCaseStatus.UNRECOVERED,
          recovery_reason: "marked_unrecovered_by_admin",
        })

        const refreshedUnrecoveredDetailResponse = await api.get(
          `/admin/dunning/${unrecoveredCase.id}`,
          {
            headers,
          }
        )

        expect(refreshedUnrecoveredDetailResponse.status).toEqual(200)
        expect(
          refreshedUnrecoveredDetailResponse.data.dunning_case
        ).toMatchObject({
          id: unrecoveredCase.id,
          status: DunningCaseStatus.UNRECOVERED,
          recovery_reason: "marked_unrecovered_by_admin",
        })

        const refreshedUnrecoveredListResponse = await api.get(
          "/admin/dunning?limit=20&offset=0&q=SUB-DUN-ADMIN-FLOW-003",
          {
            headers,
          }
        )

        expect(refreshedUnrecoveredListResponse.status).toEqual(200)
        expect(refreshedUnrecoveredListResponse.data.dunning_cases).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: unrecoveredCase.id,
              status: DunningCaseStatus.UNRECOVERED,
            }),
          ])
        )
      })

      it("updates retry schedule and validates invalid payloads", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-DUN-API-005",
          status: SubscriptionStatus.PAST_DUE,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        const dunningCase = await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: cycle.id,
          status: DunningCaseStatus.OPEN,
          next_retry_at: null,
        })

        await expect(
          api.post(
            `/admin/dunning/${dunningCase.id}/retry-schedule`,
            {
              intervals: [60, 120],
              max_attempts: 3,
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        const response = await api.post(
          `/admin/dunning/${dunningCase.id}/retry-schedule`,
          {
            reason: "short schedule",
            intervals: [60, 120],
            max_attempts: 2,
          },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.dunning_case).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
          max_attempts: 2,
          retry_schedule: expect.objectContaining({
            intervals: [60, 120],
            source: "manual_override",
          }),
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
