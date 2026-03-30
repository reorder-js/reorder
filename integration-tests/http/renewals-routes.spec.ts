import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createAdminAuthHeaders,
  createRenewalAttemptSeed,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"
import {
  RenewalApprovalStatus,
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin renewals endpoints", () => {
      it("lists renewals", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-001",
        })

        await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
        })

        const response = await api.get("/admin/renewals?limit=10&offset=0", {
          headers,
        })

        expect(response.status).toEqual(200)
        expect(response.data).toHaveProperty("renewals")
        expect(response.data).toHaveProperty("count")
      })

      it("returns renewal detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-002",
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
        })
        await createRenewalAttemptSeed(container, {
          renewal_cycle_id: cycle.id,
          attempt_no: 1,
          status: RenewalAttemptStatus.FAILED,
          finished_at: new Date(),
          error_code: "renewal_failed",
          error_message: "detail failure",
        })

        const response = await api.get(`/admin/renewals/${cycle.id}`, {
          headers,
        })

        expect(response.status).toEqual(200)
        expect(response.data.renewal.id).toEqual(cycle.id)
        expect(response.data.renewal.attempts).toHaveLength(1)
      })

      it("returns 404 for missing renewal detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.get("/admin/renewals/ren_missing", { headers })
        ).rejects.toMatchObject({
          response: {
            status: 404,
          },
        })
      })

      it("forces a renewal and returns updated detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-003",
          skip_next_cycle: true,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
        })

        const response = await api.post(
          `/admin/renewals/${cycle.id}/force`,
          {
            reason: "manual route test",
          },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.renewal).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.SUCCEEDED,
        })
      })

      it("approves and rejects renewal changes through admin endpoints", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const approvedSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-004",
        })
        const approvedCycle = await createRenewalCycleSeed(container, {
          subscription_id: approvedSubscription.id,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        const approveResponse = await api.post(
          `/admin/renewals/${approvedCycle.id}/approve-changes`,
          {
            reason: "approved from route",
          },
          { headers }
        )

        expect(approveResponse.status).toEqual(200)
        expect(approveResponse.data.renewal.approval).toMatchObject({
          required: true,
          status: RenewalApprovalStatus.APPROVED,
          reason: "approved from route",
        })

        const rejectedSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-005",
        })
        const rejectedCycle = await createRenewalCycleSeed(container, {
          subscription_id: rejectedSubscription.id,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        const rejectResponse = await api.post(
          `/admin/renewals/${rejectedCycle.id}/reject-changes`,
          {
            reason: "rejected from route",
          },
          { headers }
        )

        expect(rejectResponse.status).toEqual(200)
        expect(rejectResponse.data.renewal.approval).toMatchObject({
          required: true,
          status: RenewalApprovalStatus.REJECTED,
          reason: "rejected from route",
        })
      })

      it("validates reject reason and blocks invalid transitions", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-006",
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        await expect(
          api.post(
            `/admin/renewals/${cycle.id}/reject-changes`,
            {},
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await api.post(
          `/admin/renewals/${cycle.id}/approve-changes`,
          {
            reason: "approved once",
          },
          { headers }
        )

        await expect(
          api.post(
            `/admin/renewals/${cycle.id}/approve-changes`,
            {
              reason: "approved twice",
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 409,
          },
        })
      })

      it("blocks duplicate execution and processing conflicts", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const succeededSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-007",
          skip_next_cycle: true,
        })
        const succeededCycle = await createRenewalCycleSeed(container, {
          subscription_id: succeededSubscription.id,
          status: RenewalCycleStatus.SUCCEEDED,
        })

        await expect(
          api.post(`/admin/renewals/${succeededCycle.id}/force`, {}, { headers })
        ).rejects.toMatchObject({
          response: {
            status: 409,
          },
        })

        const processingSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-API-008",
          skip_next_cycle: true,
        })
        const processingCycle = await createRenewalCycleSeed(container, {
          subscription_id: processingSubscription.id,
          status: RenewalCycleStatus.PROCESSING,
          attempt_count: 1,
        })

        await expect(
          api.post(`/admin/renewals/${processingCycle.id}/force`, {}, { headers })
        ).rejects.toMatchObject({
          response: {
            status: 409,
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
