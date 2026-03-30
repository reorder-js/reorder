import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"
import { createPlanOfferSeed } from "../helpers/plan-offer-fixtures"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin renewals flow", () => {
      it("covers list to detail to approve to force to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-ADMIN-FLOW-001",
          skip_next_cycle: true,
        })

        await createPlanOfferSeed(container, {
          name: "PLAN-REN-ADMIN-FLOW-001",
          scope: "variant" as any,
          product_id: subscription.product_id,
          variant_id: subscription.variant_id,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: "month" as any,
              value: 2,
            },
          ],
        })

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        const listResponse = await api.get(
          "/admin/renewals?limit=20&offset=0&q=SUB-REN-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.renewals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cycle.id,
              status: RenewalCycleStatus.SCHEDULED,
              approval: expect.objectContaining({
                required: true,
                status: RenewalApprovalStatus.PENDING,
              }),
              subscription: expect.objectContaining({
                reference: "SUB-REN-ADMIN-FLOW-001",
              }),
            }),
          ])
        )

        const detailResponse = await api.get(`/admin/renewals/${cycle.id}`, {
          headers,
        })

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.renewal).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.SCHEDULED,
          approval: expect.objectContaining({
            required: true,
            status: RenewalApprovalStatus.PENDING,
          }),
        })

        const approveResponse = await api.post(
          `/admin/renewals/${cycle.id}/approve-changes`,
          {
            reason: "approved in admin flow",
          },
          { headers }
        )

        expect(approveResponse.status).toEqual(200)
        expect(approveResponse.data.renewal.approval).toMatchObject({
          required: true,
          status: RenewalApprovalStatus.APPROVED,
          reason: "approved in admin flow",
        })

        const forceResponse = await api.post(
          `/admin/renewals/${cycle.id}/force`,
          {
            reason: "forced in admin flow",
          },
          { headers }
        )

        expect(forceResponse.status).toEqual(200)
        expect(forceResponse.data.renewal).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.SUCCEEDED,
          approval: expect.objectContaining({
            required: true,
            status: RenewalApprovalStatus.APPROVED,
          }),
        })

        const refreshedDetailResponse = await api.get(
          `/admin/renewals/${cycle.id}`,
          {
            headers,
          }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.renewal).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.SUCCEEDED,
          approval: expect.objectContaining({
            required: true,
            status: RenewalApprovalStatus.APPROVED,
            reason: "approved in admin flow",
          }),
        })
        expect(refreshedDetailResponse.data.renewal.attempts).toHaveLength(1)
        expect(refreshedDetailResponse.data.renewal.attempts[0]).toMatchObject({
          attempt_no: 1,
          status: "succeeded",
        })

        const refreshedListResponse = await api.get(
          "/admin/renewals?limit=20&offset=0&q=SUB-REN-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.renewals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cycle.id,
              status: RenewalCycleStatus.SUCCEEDED,
              approval: expect.objectContaining({
                required: true,
                status: RenewalApprovalStatus.APPROVED,
              }),
              last_attempt_status: "succeeded",
            }),
          ])
        )
      })

      it("covers list to detail to reject to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-ADMIN-FLOW-002",
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        const listResponse = await api.get(
          "/admin/renewals?limit=20&offset=0&q=SUB-REN-ADMIN-FLOW-002",
          {
            headers,
          }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.renewals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cycle.id,
              status: RenewalCycleStatus.SCHEDULED,
              approval: expect.objectContaining({
                required: true,
                status: RenewalApprovalStatus.PENDING,
              }),
            }),
          ])
        )

        const detailResponse = await api.get(`/admin/renewals/${cycle.id}`, {
          headers,
        })

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.renewal.id).toEqual(cycle.id)

        const rejectResponse = await api.post(
          `/admin/renewals/${cycle.id}/reject-changes`,
          {
            reason: "rejected in admin flow",
          },
          { headers }
        )

        expect(rejectResponse.status).toEqual(200)
        expect(rejectResponse.data.renewal.approval).toMatchObject({
          required: true,
          status: RenewalApprovalStatus.REJECTED,
          reason: "rejected in admin flow",
        })

        const refreshedDetailResponse = await api.get(
          `/admin/renewals/${cycle.id}`,
          {
            headers,
          }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.renewal).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.SCHEDULED,
          approval: expect.objectContaining({
            required: true,
            status: RenewalApprovalStatus.REJECTED,
            reason: "rejected in admin flow",
          }),
        })
        expect(refreshedDetailResponse.data.renewal.attempts).toHaveLength(0)

        const refreshedListResponse = await api.get(
          "/admin/renewals?limit=20&offset=0&q=SUB-REN-ADMIN-FLOW-002",
          {
            headers,
          }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.renewals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cycle.id,
              status: RenewalCycleStatus.SCHEDULED,
              approval: expect.objectContaining({
                required: true,
                status: RenewalApprovalStatus.REJECTED,
              }),
              last_attempt_status: null,
            }),
          ])
        )
      })
    })
  },
})

jest.setTimeout(60 * 1000)
