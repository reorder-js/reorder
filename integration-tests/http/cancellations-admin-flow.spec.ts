import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
} from "../../src/modules/cancellation/types"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  createAdminAuthHeaders,
  createCancellationCaseSeed,
  createSubscriptionSeed,
} from "../helpers/cancellation-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin cancellations flow", () => {
      it("covers list to detail to apply-offer to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-ADMIN-FLOW-001",
          status: SubscriptionStatus.ACTIVE,
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.REQUESTED,
          reason: "Price is too high",
          reason_category: CancellationReasonCategory.PRICE,
        })

        const listResponse = await api.get(
          "/admin/cancellations?limit=20&offset=0&q=SUB-CAN-ADMIN-FLOW-001",
          { headers }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.cancellations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cancellationCase.id,
              status: CancellationCaseStatus.REQUESTED,
              final_outcome: null,
              subscription: expect.objectContaining({
                reference: "SUB-CAN-ADMIN-FLOW-001",
              }),
            }),
          ])
        )

        const detailResponse = await api.get(
          `/admin/cancellations/${cancellationCase.id}`,
          { headers }
        )

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.REQUESTED,
          reason: "Price is too high",
          reason_category: CancellationReasonCategory.PRICE,
          offers: [],
        })

        const applyOfferResponse = await api.post(
          `/admin/cancellations/${cancellationCase.id}/apply-offer`,
          {
            offer_type: RetentionOfferType.DISCOUNT_OFFER,
            offer_payload: {
              discount_offer: {
                discount_type: "percentage",
                discount_value: 10,
                duration_cycles: 2,
                note: "Admin flow save offer",
              },
            },
            decision_reason: "Customer accepted save offer",
          },
          { headers }
        )

        expect(applyOfferResponse.status).toEqual(200)
        expect(applyOfferResponse.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.RETAINED,
          final_outcome: CancellationFinalOutcome.RETAINED,
        })
        expect(applyOfferResponse.data.cancellation.offers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              offer_type: RetentionOfferType.DISCOUNT_OFFER,
              decision_status: RetentionOfferDecisionStatus.APPLIED,
            }),
          ])
        )

        const refreshedDetailResponse = await api.get(
          `/admin/cancellations/${cancellationCase.id}`,
          { headers }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.RETAINED,
          final_outcome: CancellationFinalOutcome.RETAINED,
          subscription: expect.objectContaining({
            reference: "SUB-CAN-ADMIN-FLOW-001",
            status: SubscriptionStatus.ACTIVE,
          }),
        })
        expect(refreshedDetailResponse.data.cancellation.offers).toHaveLength(1)
        expect(refreshedDetailResponse.data.cancellation.offers[0]).toMatchObject({
          offer_type: RetentionOfferType.DISCOUNT_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
          decision_reason: "Customer accepted save offer",
        })

        const refreshedListResponse = await api.get(
          "/admin/cancellations?limit=20&offset=0&q=SUB-CAN-ADMIN-FLOW-001",
          { headers }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.cancellations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cancellationCase.id,
              status: CancellationCaseStatus.RETAINED,
              final_outcome: CancellationFinalOutcome.RETAINED,
            }),
          ])
        )
      })

      it("covers list to detail to finalize to refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-ADMIN-FLOW-002",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: new Date("2026-04-25T12:00:00.000Z"),
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.REQUESTED,
          reason: "Switching to another service",
          reason_category: CancellationReasonCategory.SWITCHED_COMPETITOR,
        })

        const listResponse = await api.get(
          "/admin/cancellations?limit=20&offset=0&q=SUB-CAN-ADMIN-FLOW-002",
          { headers }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.cancellations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cancellationCase.id,
              status: CancellationCaseStatus.REQUESTED,
              subscription: expect.objectContaining({
                reference: "SUB-CAN-ADMIN-FLOW-002",
              }),
            }),
          ])
        )

        const detailResponse = await api.get(
          `/admin/cancellations/${cancellationCase.id}`,
          { headers }
        )

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.cancellation.id).toEqual(cancellationCase.id)

        const finalizeResponse = await api.post(
          `/admin/cancellations/${cancellationCase.id}/finalize`,
          {
            reason: "Customer confirmed cancellation after evaluation",
            reason_category: CancellationReasonCategory.SWITCHED_COMPETITOR,
            notes: "Admin flow finalized the case",
            effective_at: "end_of_cycle",
          },
          { headers }
        )

        expect(finalizeResponse.status).toEqual(200)
        expect(finalizeResponse.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.CANCELED,
          final_outcome: CancellationFinalOutcome.CANCELED,
          reason: "Customer confirmed cancellation after evaluation",
          reason_category: CancellationReasonCategory.SWITCHED_COMPETITOR,
        })

        const refreshedDetailResponse = await api.get(
          `/admin/cancellations/${cancellationCase.id}`,
          { headers }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.CANCELED,
          final_outcome: CancellationFinalOutcome.CANCELED,
          subscription: expect.objectContaining({
            reference: "SUB-CAN-ADMIN-FLOW-002",
            status: SubscriptionStatus.CANCELLED,
            next_renewal_at: null,
          }),
        })

        const refreshedListResponse = await api.get(
          "/admin/cancellations?limit=20&offset=0&q=SUB-CAN-ADMIN-FLOW-002",
          { headers }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.cancellations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: cancellationCase.id,
              status: CancellationCaseStatus.CANCELED,
              final_outcome: CancellationFinalOutcome.CANCELED,
            }),
          ])
        )
      })
    })
  },
})

jest.setTimeout(60 * 1000)
