import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { CANCELLATION_MODULE } from "../../src/modules/cancellation"
import type CancellationModuleService from "../../src/modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  RetentionOfferType,
} from "../../src/modules/cancellation/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  applyRetentionOfferWorkflow,
  ensureNextRenewalCycleWorkflow,
  finalizeCancellationWorkflow,
} from "../../src/workflows"
import {
  createCancellationCaseSeed,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/cancellation-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("cancellation smoke-check with subscriptions, renewals, and dunning", () => {
      it("retention through pause changes subscription lifecycle and removes upcoming renewal execution", async () => {
        const container = getContainer()
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const nextRenewalAt = new Date("2026-04-18T10:00:00.000Z")
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-SMOKE-001",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: nextRenewalAt,
        })

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
          },
        })

        const scheduledBeforePause = await renewalModule.listRenewalCycles({
          subscription_id: subscription.id,
        } as any)

        expect(scheduledBeforePause).toHaveLength(1)
        expect(scheduledBeforePause[0].status).toEqual(
          RenewalCycleStatus.SCHEDULED
        )

        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason_category: CancellationReasonCategory.TEMPORARY_PAUSE,
        })

        await applyRetentionOfferWorkflow(container).run({
          input: {
            cancellation_case_id: cancellationCase.id,
            offer_type: RetentionOfferType.PAUSE_OFFER,
            offer_payload: {
              pause_offer: {
                pause_cycles: 2,
                resume_at: null,
                note: "Smoke retention pause",
              },
            },
            decided_by: "smoke_admin",
            decision_reason: "Paused instead of cancel",
          },
        })

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
          },
        })

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        const updatedCase = await cancellationModule.retrieveCancellationCase(
          cancellationCase.id
        )
        const scheduledAfterPause = await renewalModule.listRenewalCycles({
          subscription_id: subscription.id,
        } as any)

        expect(updatedSubscription.status).toEqual(SubscriptionStatus.PAUSED)
        expect(updatedSubscription.paused_at).toBeTruthy()
        expect(updatedSubscription.next_renewal_at?.toISOString()).toEqual(
          nextRenewalAt.toISOString()
        )
        expect(updatedCase).toMatchObject({
          status: CancellationCaseStatus.PAUSED,
          final_outcome: CancellationFinalOutcome.PAUSED,
        })
        expect(
          scheduledAfterPause.filter(
            (cycle: any) => cycle.status === RenewalCycleStatus.SCHEDULED
          )
        ).toHaveLength(0)
      })

      it("final cancel updates subscription lifecycle and clears future renewal eligibility", async () => {
        const container = getContainer()
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const nextRenewalAt = new Date("2026-04-22T09:00:00.000Z")
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-SMOKE-002",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: nextRenewalAt,
        })

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
          },
        })

        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason: "Customer requested final cancel",
          reason_category: CancellationReasonCategory.OTHER,
        })

        const { result } = await finalizeCancellationWorkflow(container).run({
          input: {
            cancellation_case_id: cancellationCase.id,
            reason: "Customer requested final cancel",
            reason_category: CancellationReasonCategory.OTHER,
            effective_at: "end_of_cycle",
            finalized_by: "smoke_admin",
          },
        })

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        const updatedCase = await cancellationModule.retrieveCancellationCase(
          cancellationCase.id
        )
        const cyclesAfterCancel = await renewalModule.listRenewalCycles({
          subscription_id: subscription.id,
        } as any)

        expect(result.case_status).toEqual(CancellationCaseStatus.CANCELED)
        expect(result.final_outcome).toEqual(CancellationFinalOutcome.CANCELED)
        expect(new Date(result.cancel_effective_at).toISOString()).toEqual(
          nextRenewalAt.toISOString()
        )
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.CANCELLED)
        expect(updatedSubscription.cancelled_at).toBeTruthy()
        expect(updatedSubscription.next_renewal_at).toBeNull()
        expect(updatedSubscription.cancel_effective_at?.toISOString()).toEqual(
          nextRenewalAt.toISOString()
        )
        expect(updatedCase).toMatchObject({
          status: CancellationCaseStatus.CANCELED,
          final_outcome: CancellationFinalOutcome.CANCELED,
        })
        expect(
          cyclesAfterCancel.filter(
            (cycle: any) => cycle.status === RenewalCycleStatus.SCHEDULED
          )
        ).toHaveLength(0)
      })

    })
  },
})

jest.setTimeout(60 * 1000)
