import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SETTINGS_MODULE } from "../../src/modules/settings"
import type SettingsModuleService from "../../src/modules/settings/service"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../../src/modules/settings/types"
import { updateSubscriptionSettingsWorkflow } from "../../src/workflows"
import {
  updateSubscriptionSettingsStep,
  type UpdateSubscriptionSettingsStepInput,
} from "../../src/workflows/steps/update-subscription-settings"

const forceFailureStep = createStep(
  "force-settings-workflow-failure",
  async function () {
    throw new Error("forced settings workflow failure")
  },
  async function () {
    return new StepResponse(undefined)
  }
)

const failingSubscriptionSettingsWorkflow = createWorkflow(
  "failing-subscription-settings-workflow",
  function (input: UpdateSubscriptionSettingsStepInput) {
    const result = updateSubscriptionSettingsStep(input)
    const failureInput = transform({ result }, () => {
      return {}
    })
    const forcedFailure = forceFailureStep(failureInput)

    return new WorkflowResponse({
      result,
      forcedFailure,
    })
  }
)

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("subscription settings workflow integration", () => {
      it("supports optimistic locking for create and update", async () => {
        const container = getContainer()

        const firstRun = await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_trial_days: 14,
            dunning_retry_intervals: [60, 180, 360],
            max_dunning_attempts: 3,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
            expected_version: 0,
            updated_by: "admin_first",
            reason: "initial_create",
          },
        })

        expect(firstRun.result.settings).toMatchObject({
          default_trial_days: 14,
          dunning_retry_intervals: [60, 180, 360],
          max_dunning_attempts: 3,
          version: 1,
          updated_by: "admin_first",
          is_persisted: true,
        })

        const secondRun = await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_trial_days: 21,
            expected_version: 1,
            updated_by: "admin_second",
            reason: "second_update",
          },
        })

        expect(secondRun.result.settings).toMatchObject({
          default_trial_days: 21,
          version: 2,
          updated_by: "admin_second",
          is_persisted: true,
        })

        await expect(
          updateSubscriptionSettingsWorkflow(container).run({
            input: {
              default_trial_days: 28,
              expected_version: 1,
              updated_by: "admin_conflict",
              reason: "stale_update",
            },
          })
        ).rejects.toMatchObject({
          type: MedusaError.Types.CONFLICT,
        })
      })

      it("appends audit trail metadata on successful updates", async () => {
        const container = getContainer()
        const settingsModule =
          container.resolve<SettingsModuleService>(SETTINGS_MODULE)

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_trial_days: 7,
            dunning_retry_intervals: [120, 360],
            max_dunning_attempts: 2,
            expected_version: 0,
            updated_by: "admin_seed",
            reason: "seed_for_audit",
          },
        })

        const { result } = await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_trial_days: 10,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            expected_version: 1,
            updated_by: "admin_audit",
            reason: "audit_test",
          },
        })

        expect(result.settings.version).toBe(2)

        const [records] = await settingsModule.listAndCountSubscriptionSettings({
          settings_key: "global",
        } as any)
        const metadata = records[0].metadata as Record<string, unknown> | null
        const auditLog = metadata?.audit_log as Array<Record<string, unknown>>

        expect(Array.isArray(auditLog)).toBe(true)
        expect(auditLog).toHaveLength(2)
        expect(auditLog[auditLog.length - 1]).toMatchObject({
          action: "update_settings",
          who: "admin_audit",
          previous_version: 1,
          next_version: 2,
          reason: "audit_test",
          change_summary: [
            {
              field: "default_trial_days",
              from: 7,
              to: 10,
            },
            {
              field: "default_renewal_behavior",
              from: SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              to: SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            },
          ],
        })
        expect(auditLog[auditLog.length - 1].when).toBeTruthy()
      })

      it("rolls back a newly created settings record if a later step fails", async () => {
        const container = getContainer()
        const settingsModule =
          container.resolve<SettingsModuleService>(SETTINGS_MODULE)

        try {
          await failingSubscriptionSettingsWorkflow(container).run({
            input: {
              default_trial_days: 5,
              dunning_retry_intervals: [60, 180, 360],
              max_dunning_attempts: 3,
              expected_version: 0,
              updated_by: "admin_create_rollback",
              reason: "create_then_fail",
            },
          })
        } catch {}

        const fallback = await settingsModule.getSettings()
        const [records, count] = await settingsModule.listAndCountSubscriptionSettings({
          settings_key: "global",
        } as any)

        expect(fallback).toMatchObject({
          default_trial_days: 0,
          version: 0,
          is_persisted: false,
        })
        expect(count).toBe(0)
        expect(records).toHaveLength(0)
      })

      it("restores the previous persisted settings when a later step fails", async () => {
        const container = getContainer()
        const settingsModule =
          container.resolve<SettingsModuleService>(SETTINGS_MODULE)

        await updateSubscriptionSettingsWorkflow(container).run({
          input: {
            default_trial_days: 9,
            dunning_retry_intervals: [240, 480],
            max_dunning_attempts: 2,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
            expected_version: 0,
            updated_by: "admin_seed",
            reason: "persisted_seed",
          },
        })

        try {
          await failingSubscriptionSettingsWorkflow(container).run({
            input: {
              default_trial_days: 30,
              default_renewal_behavior:
                SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
              expected_version: 1,
              updated_by: "admin_rollback",
              reason: "update_then_fail",
            },
          })
        } catch {}

        const restored = await settingsModule.getSettings()

        expect(restored).toMatchObject({
          default_trial_days: 9,
          dunning_retry_intervals: [240, 480],
          max_dunning_attempts: 2,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
          version: 1,
          updated_by: "admin_seed",
          is_persisted: true,
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
