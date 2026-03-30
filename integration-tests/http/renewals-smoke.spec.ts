import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../../src/modules/subscription/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"
import { createPlanOfferSeed } from "../helpers/plan-offer-fixtures"
import {
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"
import {
  approveRenewalChangesWorkflow,
  forceRenewalCycleWorkflow,
  processRenewalCycleWorkflow,
} from "../../src/workflows"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("renewals smoke-check with subscriptions and plan offers", () => {
      it("respects subscription operational state during renewal execution", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const scheduledFor = new Date("2026-04-15T10:00:00.000Z")

        const activeSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-SMOKE-STATE-001",
          status: SubscriptionStatus.ACTIVE,
          skip_next_cycle: true,
        })
        const activeCycle = await createRenewalCycleSeed(container, {
          subscription_id: activeSubscription.id,
          scheduled_for: scheduledFor,
        })

        await processRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: activeCycle.id,
            trigger_type: "scheduler",
          },
        })

        const processedActiveCycle = await renewalModule.retrieveRenewalCycle(
          activeCycle.id
        )
        expect(processedActiveCycle.status).toEqual(RenewalCycleStatus.SUCCEEDED)

        const pausedSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-SMOKE-STATE-002",
          status: SubscriptionStatus.ACTIVE,
          skip_next_cycle: true,
        })
        await subscriptionModule.updateSubscriptions({
          id: pausedSubscription.id,
          paused_at: new Date("2026-04-10T09:00:00.000Z"),
        } as any)

        const pausedCycle = await createRenewalCycleSeed(container, {
          subscription_id: pausedSubscription.id,
          scheduled_for: scheduledFor,
        })

        await expect(
          processRenewalCycleWorkflow(container).run({
            input: {
              renewal_cycle_id: pausedCycle.id,
              trigger_type: "scheduler",
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("subscription is paused"),
        })

        const processedPausedCycle = await renewalModule.retrieveRenewalCycle(
          pausedCycle.id
        )
        expect(processedPausedCycle.status).toEqual(
          RenewalCycleStatus.SCHEDULED
        )
        expect(processedPausedCycle.attempt_count).toEqual(0)

        const cancelledSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-SMOKE-STATE-003",
          status: SubscriptionStatus.ACTIVE,
          skip_next_cycle: true,
        })
        await subscriptionModule.updateSubscriptions({
          id: cancelledSubscription.id,
          cancel_effective_at: new Date("2026-04-15T09:00:00.000Z"),
        } as any)

        const cancelledCycle = await createRenewalCycleSeed(container, {
          subscription_id: cancelledSubscription.id,
          scheduled_for: scheduledFor,
        })

        await expect(
          processRenewalCycleWorkflow(container).run({
            input: {
              renewal_cycle_id: cancelledCycle.id,
              trigger_type: "scheduler",
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("cancel is effective"),
        })

        const processedCancelledCycle = await renewalModule.retrieveRenewalCycle(
          cancelledCycle.id
        )
        expect(processedCancelledCycle.status).toEqual(
          RenewalCycleStatus.SCHEDULED
        )
        expect(processedCancelledCycle.attempt_count).toEqual(0)
      })

      it("applies approved pending changes back to the subscription state", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-SMOKE-PENDING-001",
          skip_next_cycle: true,
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 1,
        })

        await createPlanOfferSeed(container, {
          name: "PLAN-REN-SMOKE-PENDING-001",
          scope: "variant" as any,
          product_id: subscription.product_id,
          variant_id: subscription.variant_id,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: SubscriptionFrequencyInterval.MONTH as any,
              value: 2,
            },
          ],
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          pending_update_data: {
            variant_id: subscription.variant_id,
            variant_title: "Approved Variant",
            sku: "APPROVED-SMOKE-SKU",
            frequency_interval: SubscriptionFrequencyInterval.MONTH,
            frequency_value: 2,
            effective_at: null,
            requested_at: new Date("2026-04-01T08:00:00.000Z").toISOString(),
            requested_by: "admin_smoke",
          },
        } as any)

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          scheduled_for: new Date("2026-04-15T10:00:00.000Z"),
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        await approveRenewalChangesWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            decided_by: "admin_smoke",
            reason: "approved for smoke-check",
          },
        })

        await forceRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            triggered_by: "admin_smoke",
            reason: "force after approval",
          },
        })

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        const updatedCycle = await renewalModule.retrieveRenewalCycle(cycle.id)

        expect(updatedCycle.status).toEqual(RenewalCycleStatus.SUCCEEDED)
        expect(updatedCycle.approval_status).toEqual(
          RenewalApprovalStatus.APPROVED
        )
        expect(updatedCycle.applied_pending_update_data).toMatchObject({
          variant_id: subscription.variant_id,
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 2,
        })

        expect(updatedSubscription.frequency_interval).toEqual(
          SubscriptionFrequencyInterval.MONTH
        )
        expect(updatedSubscription.frequency_value).toEqual(2)
        expect(updatedSubscription.pending_update_data).toBeNull()
      })

      it("does not bypass active offer rules even when pending changes were approved", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-REN-SMOKE-OFFER-001",
          skip_next_cycle: true,
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 1,
        })

        await createPlanOfferSeed(container, {
          name: "PLAN-REN-SMOKE-OFFER-001",
          scope: "variant" as any,
          product_id: subscription.product_id,
          variant_id: subscription.variant_id,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: SubscriptionFrequencyInterval.MONTH as any,
              value: 1,
            },
          ],
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          pending_update_data: {
            variant_id: subscription.variant_id,
            variant_title: "Disallowed Variant",
            sku: "DISALLOWED-SMOKE-SKU",
            frequency_interval: SubscriptionFrequencyInterval.MONTH,
            frequency_value: 2,
            effective_at: null,
            requested_at: new Date("2026-04-01T09:00:00.000Z").toISOString(),
            requested_by: "admin_smoke",
          },
        } as any)

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          scheduled_for: new Date("2026-04-15T10:00:00.000Z"),
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
        })

        await approveRenewalChangesWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            decided_by: "admin_smoke",
            reason: "approved before offer revalidation",
          },
        })

        await expect(
          forceRenewalCycleWorkflow(container).run({
            input: {
              renewal_cycle_id: cycle.id,
              triggered_by: "admin_smoke",
              reason: "force against active offer policy",
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("not allowed"),
        })

        const unchangedSubscription =
          await subscriptionModule.retrieveSubscription(subscription.id)
        const failedCycle = await renewalModule.retrieveRenewalCycle(cycle.id)

        expect(failedCycle.status).toEqual(RenewalCycleStatus.SCHEDULED)
        expect(failedCycle.approval_status).toEqual(
          RenewalApprovalStatus.APPROVED
        )
        expect(failedCycle.applied_pending_update_data).toBeNull()
        expect(failedCycle.last_error).toBeNull()
        expect(failedCycle.attempt_count).toEqual(0)

        expect(unchangedSubscription.frequency_interval).toEqual(
          SubscriptionFrequencyInterval.MONTH
        )
        expect(unchangedSubscription.frequency_value).toEqual(1)
        expect(unchangedSubscription.pending_update_data).toMatchObject({
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 2,
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
