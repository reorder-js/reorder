import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { SETTINGS_MODULE } from ".."
import SubscriptionSettings from "../models/subscription-settings"
import SettingsModuleService from "../service"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../types"

moduleIntegrationTestRunner<SettingsModuleService>({
  moduleName: SETTINGS_MODULE,
  moduleModels: [SubscriptionSettings],
  resolve: "./src/modules/settings",
  testSuite: ({ service }) => {
    describe("SettingsModuleService", () => {
      it("returns fallback defaults when no settings record exists", async () => {
        const settings = await service.getSettings()

        expect(settings).toMatchObject({
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
      })

      it("lazy-creates the singleton on first update", async () => {
        const updated = await service.updateSettings({
          default_trial_days: 14,
          dunning_retry_intervals: [60, 180, 360],
          max_dunning_attempts: 3,
          updated_by: "admin_first",
        })

        expect(updated).toMatchObject({
          settings_key: "global",
          default_trial_days: 14,
          dunning_retry_intervals: [60, 180, 360],
          max_dunning_attempts: 3,
          version: 1,
          updated_by: "admin_first",
          is_persisted: true,
        })
        expect(updated.updated_at).toBeTruthy()

        const [records, count] = await service.listAndCountSubscriptionSettings({
          settings_key: "global",
        } as any)

        expect(count).toBe(1)
        expect(records[0].settings_key).toBe("global")
      })

      it("updates the persisted singleton and increments version", async () => {
        await service.updateSettings({
          default_trial_days: 7,
          dunning_retry_intervals: [60, 180],
          max_dunning_attempts: 2,
          updated_by: "admin_seed",
        })

        const updated = await service.updateSettings({
          default_renewal_behavior:
            SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
          updated_by: "admin_second",
        })

        expect(updated).toMatchObject({
          settings_key: "global",
          default_trial_days: 7,
          dunning_retry_intervals: [60, 180],
          max_dunning_attempts: 2,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
          version: 2,
          updated_by: "admin_second",
          is_persisted: true,
        })
      })

      it("returns persisted settings from getSettings after update", async () => {
        await service.updateSettings({
          default_trial_days: 21,
          dunning_retry_intervals: [120, 240, 480],
          max_dunning_attempts: 3,
          updated_by: "admin_reader",
        })

        const settings = await service.getSettings()

        expect(settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 21,
          dunning_retry_intervals: [120, 240, 480],
          max_dunning_attempts: 3,
          version: 1,
          updated_by: "admin_reader",
          is_persisted: true,
        })
      })

      it("resets persisted settings back to fallback defaults", async () => {
        await service.updateSettings({
          default_trial_days: 30,
          dunning_retry_intervals: [60, 120, 180],
          max_dunning_attempts: 3,
          updated_by: "admin_reset",
        })

        const reset = await service.resetSettings()

        expect(reset).toMatchObject({
          settings_key: "global",
          default_trial_days: 0,
          dunning_retry_intervals: [1440, 4320, 10080],
          max_dunning_attempts: 3,
          version: 0,
          updated_by: null,
          updated_at: null,
          is_persisted: false,
        })

        const [records, count] = await service.listAndCountSubscriptionSettings({
          settings_key: "global",
        } as any)

        expect(count).toBe(0)
        expect(records).toHaveLength(0)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
