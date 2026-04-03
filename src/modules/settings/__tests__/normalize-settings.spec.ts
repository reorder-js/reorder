import { MedusaError } from "@medusajs/framework/utils"
import {
  buildDefaultSubscriptionSettings,
  normalizeSubscriptionSettingsPayload,
} from "../utils/normalize-settings"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../types"

describe("settings normalize-settings", () => {
  it("builds default fallback settings", () => {
    const defaults = buildDefaultSubscriptionSettings()

    expect(defaults).toMatchObject({
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
      metadata: null,
      is_persisted: false,
    })
  })

  it("normalizes retry intervals and infers max attempts when omitted", () => {
    const normalized = normalizeSubscriptionSettingsPayload({
      dunning_retry_intervals: [60, 180, 360],
      updated_by: "admin_user",
    })

    expect(normalized).toMatchObject({
      dunning_retry_intervals: [60, 180, 360],
      max_dunning_attempts: 3,
      updated_by: "admin_user",
      metadata: null,
    })
  })

  it("accepts an explicit valid settings payload", () => {
    const normalized = normalizeSubscriptionSettingsPayload({
      default_trial_days: 14,
      dunning_retry_intervals: [1440, 2880],
      max_dunning_attempts: 2,
      default_renewal_behavior:
        SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
      default_cancellation_behavior:
        SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
      updated_by: "admin_user",
      metadata: {
        source: "module-test",
      },
    })

    expect(normalized).toMatchObject({
      default_trial_days: 14,
      dunning_retry_intervals: [1440, 2880],
      max_dunning_attempts: 2,
      default_renewal_behavior:
        SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
      default_cancellation_behavior:
        SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
      updated_by: "admin_user",
      metadata: {
        source: "module-test",
      },
    })
  })

  it("rejects invalid default_trial_days", () => {
    expect(() =>
      normalizeSubscriptionSettingsPayload({
        default_trial_days: -1,
      })
    ).toThrow(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'default_trial_days' must be greater than or equal to 0"
      )
    )
  })

  it("rejects invalid max_dunning_attempts", () => {
    expect(() =>
      normalizeSubscriptionSettingsPayload({
        max_dunning_attempts: 0,
      })
    ).toThrow(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'max_dunning_attempts' must be greater than 0"
      )
    )
  })

  it("rejects non-positive retry intervals", () => {
    expect(() =>
      normalizeSubscriptionSettingsPayload({
        dunning_retry_intervals: [60, 0, 180],
      })
    ).toThrow(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'dunning_retry_intervals' must contain positive values only"
      )
    )
  })

  it("rejects retry intervals that are not strictly increasing", () => {
    expect(() =>
      normalizeSubscriptionSettingsPayload({
        dunning_retry_intervals: [60, 60, 180],
      })
    ).toThrow(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'dunning_retry_intervals' must be strictly increasing without duplicates"
      )
    )
  })

  it("rejects mismatch between max attempts and retry interval length", () => {
    expect(() =>
      normalizeSubscriptionSettingsPayload({
        dunning_retry_intervals: [60, 180, 360],
        max_dunning_attempts: 2,
      })
    ).toThrow(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'max_dunning_attempts' must match the number of 'dunning_retry_intervals'"
      )
    )
  })
})
