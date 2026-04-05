import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
} from "../../src/modules/cancellation/types"
import { DunningCaseStatus } from "../../src/modules/dunning/types"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  createAdminAuthHeaders,
  createCancellationCaseSeed,
  createDunningCaseSeed,
  createRenewalCycleSeed,
  createRetentionOfferEventSeed,
  createSubscriptionSeed,
} from "../helpers/cancellation-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin cancellation endpoints", () => {
      it("lists cancellation cases with filters and returns detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const keptSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-API-001",
          status: SubscriptionStatus.ACTIVE,
        })
        const filteredOutSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-API-002",
          status: SubscriptionStatus.ACTIVE,
        })

        const keptCase = await createCancellationCaseSeed(container, {
          subscription_id: keptSubscription.id,
          status: CancellationCaseStatus.RETAINED,
          reason: "Price sensitivity",
          reason_category: CancellationReasonCategory.PRICE,
          final_outcome: CancellationFinalOutcome.RETAINED,
          finalized_at: new Date("2026-04-01T10:00:00.000Z"),
          finalized_by: "admin_api",
          metadata: {
            source: "route-test",
          },
        })
        await createRetentionOfferEventSeed(container, {
          cancellation_case_id: keptCase.id,
          offer_type: RetentionOfferType.DISCOUNT_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
          decision_reason: "Accepted in admin route test",
        })

        await createCancellationCaseSeed(container, {
          subscription_id: filteredOutSubscription.id,
          status: CancellationCaseStatus.CANCELED,
          reason: "Switched to competitor",
          reason_category: CancellationReasonCategory.SWITCHED_COMPETITOR,
          final_outcome: CancellationFinalOutcome.CANCELED,
          finalized_at: new Date("2026-04-01T11:00:00.000Z"),
          finalized_by: "admin_api",
        })

        const listResponse = await api.get(
          "/admin/cancellations?limit=20&offset=0&q=SUB-CAN-API-001&reason_category=price&final_outcome=retained&offer_type=discount_offer",
          { headers }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.count).toEqual(1)
        expect(listResponse.data.cancellations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: keptCase.id,
              status: CancellationCaseStatus.RETAINED,
              final_outcome: CancellationFinalOutcome.RETAINED,
              subscription: expect.objectContaining({
                reference: "SUB-CAN-API-001",
              }),
            }),
          ])
        )

        const detailResponse = await api.get(
          `/admin/cancellations/${keptCase.id}`,
          { headers }
        )

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.cancellation).toMatchObject({
          id: keptCase.id,
          reason: "Price sensitivity",
          reason_category: CancellationReasonCategory.PRICE,
          final_outcome: CancellationFinalOutcome.RETAINED,
          subscription: expect.objectContaining({
            reference: "SUB-CAN-API-001",
          }),
          metadata: {
            source: "route-test",
          },
        })
        expect(detailResponse.data.cancellation.offers).toHaveLength(1)
        expect(detailResponse.data.cancellation.offers[0]).toMatchObject({
          offer_type: RetentionOfferType.DISCOUNT_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
        })
      })

      it("returns linked dunning and renewal summaries in cancellation detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-API-003",
          status: SubscriptionStatus.PAST_DUE,
        })
        const renewal = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
          scheduled_for: new Date("2026-04-18T09:30:00.000Z"),
        })
        await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: renewal.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 1,
          last_payment_error_message: "Need another retry",
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason: "Billing issue",
          reason_category: CancellationReasonCategory.BILLING,
        })

        const response = await api.get(
          `/admin/cancellations/${cancellationCase.id}`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.cancellation).toMatchObject({
          id: cancellationCase.id,
          dunning: expect.objectContaining({
            status: DunningCaseStatus.RETRY_SCHEDULED,
            attempt_count: 1,
          }),
          renewal: expect.objectContaining({
            renewal_cycle_id: renewal.id,
            status: RenewalCycleStatus.FAILED,
          }),
          subscription: expect.objectContaining({
            reference: "SUB-CAN-API-003",
            status: SubscriptionStatus.PAST_DUE,
          }),
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
