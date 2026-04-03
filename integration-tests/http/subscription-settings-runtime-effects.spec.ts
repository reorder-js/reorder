import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { CANCELLATION_MODULE } from "../../src/modules/cancellation"
import type CancellationModuleService from "../../src/modules/cancellation/service"
import { CancellationCaseStatus } from "../../src/modules/cancellation/types"
import { DUNNING_MODULE } from "../../src/modules/dunning"
import type DunningModuleService from "../../src/modules/dunning/service"
import { DunningCaseStatus } from "../../src/modules/dunning/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../../src/modules/subscription/types"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../../src/modules/settings/types"
import {
  ensureNextRenewalCycleWorkflow,
  startCancellationCaseWorkflow,
  startDunningWorkflow,
  updateSubscriptionSettingsWorkflow,
} from "../../src/workflows"
import {
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("subscription settings runtime effects", () => {
      it("uses settings defaults when creating a new dunning case", async () => {
        const container = getContainer()
        const dunningModule =
          container.resolve<DunningModuleService>(DUNNING_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SET-DUN-001",
          status: SubscriptionStatus.ACTIVE,
        })
        const renewalCycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
        })

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            dunning_retry_intervals: [30, 90, 240],
            max_dunning_attempts: 3,
            expected_version: 0,
            updated_by: "admin_runtime_dunning",
            reason: "runtime_dunning_defaults",
          },
        })

        const { result } = await startDunningWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            renewal_cycle_id: renewalCycle.id,
            payment_failure_source: "payment_provider",
            payment_error_message: "Card declined",
            triggered_by: "system_test",
            reason: "runtime_settings_test",
          },
        })

        const dunningCase = await dunningModule.retrieveDunningCase(
          result.dunning_case_id
        )

        expect(dunningCase).toMatchObject({
          status: DunningCaseStatus.RETRY_SCHEDULED,
          max_attempts: 3,
          retry_schedule: {
            strategy: "fixed_intervals",
            intervals: [30, 90, 240],
            timezone: "UTC",
            source: "default_policy",
          },
        })
        expect(dunningCase.metadata).toMatchObject({
          settings_policy: {
            dunning_retry_intervals: [30, 90, 240],
            max_dunning_attempts: 3,
            settings_version: 1,
            is_persisted: true,
          },
        })
      })

      it("snapshots cancellation default behavior when creating a new case and does not rewrite the active case retroactively", async () => {
        const container = getContainer()
        const cancellationModule =
          container.resolve<CancellationModuleService>(CANCELLATION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SET-CAN-001",
          status: SubscriptionStatus.ACTIVE,
        })

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            expected_version: 0,
            updated_by: "admin_runtime_cancel_first",
            reason: "runtime_cancel_defaults_first",
          },
        })

        const firstRun = await startCancellationCaseWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            reason: "Too expensive",
            entry_context: {
              source: "admin_manual",
              triggered_by: "admin_runtime_cancel_first",
            },
          },
        })

        expect(firstRun.result.current.metadata).toMatchObject({
          settings_policy: {
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            settings_version: 1,
            is_persisted: true,
          },
        })

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
            expected_version: 1,
            updated_by: "admin_runtime_cancel_second",
            reason: "runtime_cancel_defaults_second",
          },
        })

        const secondRun = await startCancellationCaseWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            notes: "Follow-up note",
            entry_context: {
              source: "admin_manual",
              triggered_by: "admin_runtime_cancel_second",
            },
          },
        })

        const cases = await cancellationModule.listCancellationCases({
          subscription_id: subscription.id,
        } as any)

        expect(cases).toHaveLength(1)
        expect(secondRun.result.current.id).toEqual(firstRun.result.current.id)
        expect(secondRun.result.current.status).toEqual(
          CancellationCaseStatus.REQUESTED
        )
        expect(secondRun.result.current.metadata).toMatchObject({
          settings_policy: {
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            settings_version: 1,
            is_persisted: true,
          },
        })
      })

      it("uses renewal behavior at create time and does not retroactively rewrite an existing cycle when global settings change", async () => {
        const container = getContainer()
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SET-REN-001",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: new Date("2026-05-15T10:00:00.000Z"),
        })

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_renewal_behavior:
              SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
            expected_version: 0,
            updated_by: "admin_runtime_renewal_first",
            reason: "runtime_renewal_create_behavior",
          },
        })

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
          },
        })

        const [createdCycle] = (await renewalModule.listRenewalCycles({
          subscription_id: subscription.id,
        } as any)) as Array<Record<string, any>>

        expect(createdCycle).toMatchObject({
          status: RenewalCycleStatus.SCHEDULED,
          approval_required: false,
          approval_status: null,
          metadata: {
            settings_policy: {
              default_renewal_behavior:
                SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              settings_version: 1,
              is_persisted: true,
            },
          },
        })

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_renewal_behavior:
              SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            expected_version: 1,
            updated_by: "admin_runtime_renewal_second",
            reason: "runtime_renewal_global_change",
          },
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          pending_update_data: {
            variant_id: subscription.variant_id,
            variant_title: "Changed Variant",
            frequency_interval: SubscriptionFrequencyInterval.MONTH,
            frequency_value: 2,
            effective_at: new Date("2026-05-10T00:00:00.000Z").toISOString(),
          },
        } as any)

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
          },
        })

        const updatedCycle = await renewalModule.retrieveRenewalCycle(
          createdCycle.id
        )

        expect(updatedCycle).toMatchObject({
          id: createdCycle.id,
          approval_required: false,
          approval_status: null,
          metadata: {
            settings_policy: {
              default_renewal_behavior:
                SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              settings_version: 1,
              is_persisted: true,
            },
          },
        })

        const futureSubscription = await createSubscriptionSeed(container, {
          reference: "SUB-SET-REN-002",
          status: SubscriptionStatus.ACTIVE,
          next_renewal_at: new Date("2026-05-20T10:00:00.000Z"),
        })

        await subscriptionModule.updateSubscriptions({
          id: futureSubscription.id,
          pending_update_data: {
            variant_id: futureSubscription.variant_id,
            variant_title: "Future Variant",
            frequency_interval: SubscriptionFrequencyInterval.MONTH,
            frequency_value: 2,
            effective_at: new Date("2026-05-18T00:00:00.000Z").toISOString(),
          },
        } as any)

        await ensureNextRenewalCycleWorkflow(container).run({
          input: {
            subscription_id: futureSubscription.id,
          },
        })

        const cycles = (await renewalModule.listRenewalCycles({
          subscription_id: futureSubscription.id,
        } as any)) as Array<Record<string, any>>

        expect(cycles).toHaveLength(1)
        expect(cycles[0]).toMatchObject({
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
          metadata: {
            settings_policy: {
              default_renewal_behavior:
                SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
              settings_version: 2,
              is_persisted: true,
            },
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
