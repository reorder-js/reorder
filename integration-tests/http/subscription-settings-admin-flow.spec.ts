import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { DUNNING_MODULE } from "../../src/modules/dunning"
import type DunningModuleService from "../../src/modules/dunning/service"
import { DunningCaseStatus } from "../../src/modules/dunning/types"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../../src/modules/settings/types"
import { startDunningWorkflow } from "../../src/workflows"
import {
  createAdminAuthHeaders,
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscription settings flow", () => {
      it("covers read, edit, save, refresh, and runtime effect for new operations", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const dunningModule =
          container.resolve<DunningModuleService>(DUNNING_MODULE)

        const initialResponse = await api.get("/admin/subscription-settings", {
          headers,
        })

        expect(initialResponse.status).toEqual(200)
        expect(initialResponse.data.subscription_settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 0,
          dunning_retry_intervals: [1440, 4320, 10080],
          max_dunning_attempts: 3,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
          version: 0,
          updated_by: null,
          updated_at: null,
          is_persisted: false,
        })

        const saveResponse = await api.post(
          "/admin/subscription-settings",
          {
            default_trial_days: 21,
            dunning_retry_intervals: [45, 180, 720],
            max_dunning_attempts: 3,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            expected_version: 0,
            reason: "admin_flow_save",
          },
          { headers }
        )

        expect(saveResponse.status).toEqual(200)
        expect(saveResponse.data.subscription_settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 21,
          dunning_retry_intervals: [45, 180, 720],
          max_dunning_attempts: 3,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
          version: 1,
          is_persisted: true,
        })
        expect(saveResponse.data.subscription_settings.updated_at).toBeTruthy()

        const refreshedResponse = await api.get("/admin/subscription-settings", {
          headers,
        })

        expect(refreshedResponse.status).toEqual(200)
        expect(refreshedResponse.data.subscription_settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 21,
          dunning_retry_intervals: [45, 180, 720],
          max_dunning_attempts: 3,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
          version: 1,
          is_persisted: true,
        })
        expect(refreshedResponse.data.subscription_settings.updated_at).toEqual(
          saveResponse.data.subscription_settings.updated_at
        )
        expect(refreshedResponse.data.subscription_settings.updated_by).toEqual(
          saveResponse.data.subscription_settings.updated_by
        )

        const repeatedReadResponse = await api.get(
          "/admin/subscription-settings",
          { headers }
        )

        expect(repeatedReadResponse.status).toEqual(200)
        expect(repeatedReadResponse.data.subscription_settings).toEqual(
          refreshedResponse.data.subscription_settings
        )

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SET-ADMIN-FLOW-001",
        })
        const renewalCycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.FAILED,
        })

        const dunningRun = await startDunningWorkflow(container).run({
          input: {
            subscription_id: subscription.id,
            renewal_cycle_id: renewalCycle.id,
            payment_failure_source: "payment_provider",
            payment_error_message: "Admin flow runtime effect",
            triggered_by: "admin_flow_test",
            reason: "settings_runtime_effect",
          },
        })

        const dunningCase = await dunningModule.retrieveDunningCase(
          dunningRun.result.dunning_case_id
        )

        expect(dunningCase).toMatchObject({
          status: DunningCaseStatus.RETRY_SCHEDULED,
          max_attempts: 3,
          retry_schedule: {
            strategy: "fixed_intervals",
            intervals: [45, 180, 720],
            timezone: "UTC",
            source: "default_policy",
          },
          metadata: {
            settings_policy: {
              dunning_retry_intervals: [45, 180, 720],
              max_dunning_attempts: 3,
              settings_version: 1,
              is_persisted: true,
            },
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
