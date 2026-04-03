import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../../src/modules/settings/types"
import { createAdminAuthHeaders } from "../helpers/renewal-fixtures"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscription settings endpoints", () => {
      it("returns fallback defaults from GET when no persisted settings exist", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const response = await api.get("/admin/subscription-settings", {
          headers,
        })

        expect(response.status).toEqual(200)
        expect(response.data.subscription_settings).toMatchObject({
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

      it("creates and then updates persisted settings through POST", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        const createResponse = await api.post(
          "/admin/subscription-settings",
          {
            default_trial_days: 14,
            dunning_retry_intervals: [60, 180, 360],
            max_dunning_attempts: 3,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            expected_version: 0,
            reason: "route_create",
          },
          { headers }
        )

        expect(createResponse.status).toEqual(200)
        expect(createResponse.data.subscription_settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 14,
          dunning_retry_intervals: [60, 180, 360],
          max_dunning_attempts: 3,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
          version: 1,
          is_persisted: true,
        })
        expect(createResponse.data.subscription_settings.updated_at).toBeTruthy()

        const updateResponse = await api.post(
          "/admin/subscription-settings",
          {
            default_trial_days: 21,
            dunning_retry_intervals: [120, 480],
            max_dunning_attempts: 2,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
            expected_version: 1,
            reason: "route_update",
          },
          { headers }
        )

        expect(updateResponse.status).toEqual(200)
        expect(updateResponse.data.subscription_settings).toMatchObject({
          settings_key: "global",
          default_trial_days: 21,
          dunning_retry_intervals: [120, 480],
          max_dunning_attempts: 2,
          default_renewal_behavior:
            SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
          default_cancellation_behavior:
            SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
          version: 2,
          is_persisted: true,
        })
      })

      it("returns 400 for invalid payloads", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.post(
            "/admin/subscription-settings",
            {
              default_trial_days: -1,
              dunning_retry_intervals: [60, 180],
              max_dunning_attempts: 2,
              default_renewal_behavior:
                SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              default_cancellation_behavior:
                SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
              expected_version: 0,
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.post(
            "/admin/subscription-settings",
            {
              default_trial_days: 7,
              dunning_retry_intervals: [60, 60],
              max_dunning_attempts: 2,
              default_renewal_behavior:
                SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              default_cancellation_behavior:
                SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
              expected_version: 0,
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.post(
            "/admin/subscription-settings",
            {
              default_trial_days: 7,
              dunning_retry_intervals: [60, 180, 360],
              max_dunning_attempts: 2,
              default_renewal_behavior:
                SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              default_cancellation_behavior:
                SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
              expected_version: 0,
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })

        await expect(
          api.post(
            "/admin/subscription-settings",
            {
              default_trial_days: 7,
              dunning_retry_intervals: [60, 180],
              max_dunning_attempts: 2,
              default_renewal_behavior: "invalid_behavior",
              default_cancellation_behavior:
                SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
              expected_version: 0,
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })
      })

      it("returns 409 conflict for stale expected_version", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await api.post(
          "/admin/subscription-settings",
          {
            default_trial_days: 10,
            dunning_retry_intervals: [60, 180],
            max_dunning_attempts: 2,
            default_renewal_behavior:
              SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
            default_cancellation_behavior:
              SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
            expected_version: 0,
            reason: "seed_conflict",
          },
          { headers }
        )

        await expect(
          api.post(
            "/admin/subscription-settings",
            {
              default_trial_days: 15,
              dunning_retry_intervals: [120, 240],
              max_dunning_attempts: 2,
              default_renewal_behavior:
                SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
              default_cancellation_behavior:
                SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
              expected_version: 0,
              reason: "stale_conflict",
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 409,
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
