import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  getAdminCancellationDetail,
  listAdminCancellationCases,
} from "../../src/modules/cancellation/utils/admin-query"
import { CANCELLATION_MODULE } from "../../src/modules/cancellation"
import type CancellationModuleService from "../../src/modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
} from "../../src/modules/cancellation/types"
import { ACTIVITY_LOG_MODULE } from "../../src/modules/activity-log"
import type ActivityLogModuleService from "../../src/modules/activity-log/service"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../../src/modules/activity-log/types"
import { DunningCaseStatus } from "../../src/modules/dunning/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  applyRetentionOfferWorkflow,
  finalizeCancellationWorkflow,
  startCancellationCaseWorkflow,
  updateCancellationReasonWorkflow,
} from "../../src/workflows"
import {
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
  testSuite: ({ getContainer }) => {
    describe("cancellation query and workflows", () => {
      it("lists cancellation cases with offer-type filters and returns detail with linked summaries", async () => {
        const container = getContainer()

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-QUERY-001",
          status: SubscriptionStatus.PAST_DUE,
        })
        const renewal = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
          scheduled_for: new Date("2026-04-15T10:00:00.000Z"),
        })
        await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: renewal.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
          attempt_count: 2,
          last_payment_error_message: "Card declined",
        })

        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason: "Price too high",
          reason_category: CancellationReasonCategory.PRICE,
          metadata: {
            source: "query-test",
          },
        })
        await createRetentionOfferEventSeed(container, {
          cancellation_case_id: cancellationCase.id,
          offer_type: RetentionOfferType.DISCOUNT_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
          decision_reason: "Customer accepted discount",
        })

        const listResponse = await listAdminCancellationCases(container, {
          limit: 10,
          offset: 0,
          q: "SUB-CAN-QUERY-001",
          reason_category: [CancellationReasonCategory.PRICE],
          offer_type: [RetentionOfferType.DISCOUNT_OFFER],
        })

        expect(listResponse.count).toEqual(1)
        expect(listResponse.cancellations).toHaveLength(1)
        expect(listResponse.cancellations[0]).toMatchObject({
          id: cancellationCase.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          subscription: expect.objectContaining({
            reference: "SUB-CAN-QUERY-001",
          }),
        })

        const detailResponse = await getAdminCancellationDetail(
          container,
          cancellationCase.id
        )

        expect(detailResponse.cancellation).toMatchObject({
          id: cancellationCase.id,
          reason: "Price too high",
          reason_category: CancellationReasonCategory.PRICE,
          subscription: expect.objectContaining({
            reference: "SUB-CAN-QUERY-001",
          }),
          dunning: expect.objectContaining({
            status: DunningCaseStatus.RETRY_SCHEDULED,
            attempt_count: 2,
          }),
          renewal: expect.objectContaining({
            renewal_cycle_id: renewal.id,
            status: RenewalCycleStatus.SCHEDULED,
          }),
          metadata: {
            source: "query-test",
          },
        })
        expect(detailResponse.cancellation.offers).toHaveLength(1)
        expect(detailResponse.cancellation.offers[0]).toMatchObject({
          offer_type: RetentionOfferType.DISCOUNT_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
        })
      })

      it("starts a cancellation case and reuses the active case idempotently", async () => {
        const container = getContainer()
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-WF-001",
          status: SubscriptionStatus.ACTIVE,
        })

        const firstRun = await startCancellationCaseWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            reason: "Need a break",
            reason_category: CancellationReasonCategory.TEMPORARY_PAUSE,
            notes: "first intent",
            entry_context: {
              source: "subscription_detail",
              triggered_by: "admin_1",
            },
          },
        })

        expect(firstRun.result).toMatchObject({
          action: "created",
          current: {
            subscription_id: subscription.id,
            status: CancellationCaseStatus.REQUESTED,
          },
        })

        const secondRun = await startCancellationCaseWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            reason: "Different reason should not overwrite existing one",
            reason_category: CancellationReasonCategory.OTHER,
            notes: "second intent",
            entry_context: {
              source: "subscription_list",
              triggered_by: "admin_2",
            },
          },
        })

        const cases = await cancellationModule.listCancellationCases({
          subscription_id: subscription.id,
        } as any)

        expect(secondRun.result).toMatchObject({
          action: "updated",
          current: {
            id: firstRun.result.current.id,
          },
        })
        expect(cases).toHaveLength(1)
        expect(cases[0]).toMatchObject({
          id: firstRun.result.current.id,
          reason: "Need a break",
          reason_category: CancellationReasonCategory.TEMPORARY_PAUSE,
          notes: "first intent",
        })

        const logs = await activityLogModule.listSubscriptionLogs({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_CASE_STARTED,
        } as any)

        expect(logs).toHaveLength(2)
        expect(logs[0]).toMatchObject({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_CASE_STARTED,
          actor_type: ActivityLogActorType.USER,
        })
      })

      it("accepts a pause offer and materializes paused subscription state", async () => {
        const container = getContainer()
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-WF-004",
          status: SubscriptionStatus.ACTIVE,
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason_category: CancellationReasonCategory.TEMPORARY_PAUSE,
        })

        const { result } = await applyRetentionOfferWorkflow(container).run({
          input: {
            cancellation_case_id: cancellationCase.id,
            offer_type: RetentionOfferType.PAUSE_OFFER,
            offer_payload: {
              pause_offer: {
                pause_cycles: 2,
                resume_at: null,
                note: "Pause instead of churn",
              },
            },
            decided_by: "admin_pause",
            decision_reason: "Customer accepted pause",
          },
        })

        const updatedCase = await cancellationModule.retrieveCancellationCase(
          cancellationCase.id
        )
        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        const events = await cancellationModule.listRetentionOfferEvents({
          cancellation_case_id: cancellationCase.id,
        } as any)

        expect(result).toMatchObject({
          cancellation_case_id: cancellationCase.id,
          offer_type: RetentionOfferType.PAUSE_OFFER,
          final_case_status: CancellationCaseStatus.PAUSED,
          final_outcome: CancellationFinalOutcome.PAUSED,
        })
        expect(updatedCase).toMatchObject({
          status: CancellationCaseStatus.PAUSED,
          final_outcome: CancellationFinalOutcome.PAUSED,
        })
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.PAUSED)
        expect(updatedSubscription.paused_at).toBeTruthy()
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
          offer_type: RetentionOfferType.PAUSE_OFFER,
          decision_status: RetentionOfferDecisionStatus.APPLIED,
        })

        const logs = await activityLogModule.listSubscriptionLogs({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_OFFER_APPLIED,
        } as any)

        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_OFFER_APPLIED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_pause",
        })
      })

      it("updates cancellation reason and records an activity log entry", async () => {
        const container = getContainer()
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-WF-004A",
          status: SubscriptionStatus.ACTIVE,
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.REQUESTED,
          reason: "Initial reason",
          reason_category: CancellationReasonCategory.OTHER,
          notes: "Initial note",
        })

        const { result } = await updateCancellationReasonWorkflow(container).run({
          input: {
            cancellation_case_id: cancellationCase.id,
            reason: "Updated billing reason",
            reason_category: CancellationReasonCategory.BILLING,
            notes: "Updated by admin",
            updated_by: "admin_reason",
            update_reason: "Refined churn classification",
          },
        })

        const updatedCase = await cancellationModule.retrieveCancellationCase(
          cancellationCase.id
        )

        expect(result).toMatchObject({
          cancellation_case_id: cancellationCase.id,
          reason: "Updated billing reason",
          reason_category: CancellationReasonCategory.BILLING,
        })
        expect(updatedCase).toMatchObject({
          reason: "Updated billing reason",
          reason_category: CancellationReasonCategory.BILLING,
          notes: "Updated by admin",
        })

        const logs = await activityLogModule.listSubscriptionLogs({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_REASON_UPDATED,
        } as any)

        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_REASON_UPDATED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_reason",
          reason: "Refined churn classification",
        })
      })

      it("rejects retention offers that are out of policy", async () => {
        const container = getContainer()
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-WF-005",
          status: SubscriptionStatus.PAST_DUE,
        })
        const renewal = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
        })
        await createDunningCaseSeed(container, {
          subscription_id: subscription.id,
          renewal_cycle_id: renewal.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason_category: CancellationReasonCategory.PRICE,
        })

        await expect(
          applyRetentionOfferWorkflow(container).run({
            input: {
              cancellation_case_id: cancellationCase.id,
              offer_type: RetentionOfferType.DISCOUNT_OFFER,
              offer_payload: {
                discount_offer: {
                  discount_type: "percentage",
                  discount_value: 15,
                  duration_cycles: 2,
                  note: "Should be rejected while past due",
                },
              },
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("out of policy"),
        })

        const events = await cancellationModule.listRetentionOfferEvents({
          cancellation_case_id: cancellationCase.id,
        } as any)

        expect(events).toHaveLength(0)
      })

      it("finalizes cancellation, requires a reason, and updates subscription lifecycle", async () => {
        const container = getContainer()
        const activityLogModule =
          container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const nextRenewalAt = new Date("2026-04-20T12:00:00.000Z")
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-CAN-WF-006",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: nextRenewalAt,
        })
        const cancellationCase = await createCancellationCaseSeed(container, {
          subscription_id: subscription.id,
          status: CancellationCaseStatus.EVALUATING_RETENTION,
          reason_category: CancellationReasonCategory.BILLING,
        })

        await expect(
          finalizeCancellationWorkflow(container).run({
            input: {
              cancellation_case_id: cancellationCase.id,
              effective_at: "end_of_cycle",
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("requires a reason"),
        })

        const { result } = await finalizeCancellationWorkflow(container).run({
          input: {
            cancellation_case_id: cancellationCase.id,
            reason: "Customer wants to cancel after billing issues",
            reason_category: CancellationReasonCategory.BILLING,
            notes: "Finalized from workflow test",
            finalized_by: "admin_cancel",
            effective_at: "end_of_cycle",
          },
        })

        const updatedCase = await cancellationModule.retrieveCancellationCase(
          cancellationCase.id
        )
        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )

        expect(result.case_status).toEqual(CancellationCaseStatus.CANCELED)
        expect(result.final_outcome).toEqual(CancellationFinalOutcome.CANCELED)
        expect(new Date(result.cancel_effective_at).toISOString()).toEqual(
          nextRenewalAt.toISOString()
        )
        expect(updatedCase).toMatchObject({
          status: CancellationCaseStatus.CANCELED,
          final_outcome: CancellationFinalOutcome.CANCELED,
          reason: "Customer wants to cancel after billing issues",
          reason_category: CancellationReasonCategory.BILLING,
          finalized_by: "admin_cancel",
        })
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.CANCELLED)
        expect(updatedSubscription.cancelled_at).toBeTruthy()
        expect(updatedSubscription.next_renewal_at).toBeNull()
        expect(updatedSubscription.cancel_effective_at?.toISOString()).toEqual(
          nextRenewalAt.toISOString()
        )

        const logs = await activityLogModule.listSubscriptionLogs({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_FINALIZED,
        } as any)

        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
          subscription_id: subscription.id,
          event_type: ActivityLogEventType.CANCELLATION_FINALIZED,
          actor_type: ActivityLogActorType.USER,
          actor_id: "admin_cancel",
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
