import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import { GLOBAL_SUBSCRIPTION_SETTINGS_KEY } from "./types"
import SubscriptionSettings from "./models/subscription-settings"
import {
  buildDefaultSubscriptionSettings,
  normalizeSubscriptionSettingsPayload,
  type SubscriptionSettingsShape,
  type UpdateSubscriptionSettingsInput,
} from "./utils/normalize-settings"

class SettingsModuleService extends MedusaService({
  SubscriptionSettings,
}) {
  async getSettings(): Promise<SubscriptionSettingsShape> {
    const [record] = (await this.listSubscriptionSettings({
      settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
    } as any)) as Array<Record<string, any>>

    if (!record) {
      return buildDefaultSubscriptionSettings()
    }

    return {
      settings_key: record.settings_key,
      default_trial_days: record.default_trial_days,
      dunning_retry_intervals: Array.isArray(record.dunning_retry_intervals)
        ? record.dunning_retry_intervals.map((value: unknown) => Number(value))
        : [],
      max_dunning_attempts: record.max_dunning_attempts,
      default_renewal_behavior: record.default_renewal_behavior,
      default_cancellation_behavior: record.default_cancellation_behavior,
      version: record.version,
      updated_by: record.updated_by ?? null,
      updated_at: record.updated_at ? new Date(record.updated_at) : null,
      metadata: record.metadata ?? null,
      is_persisted: true,
    }
  }

  async updateSettings(
    input: UpdateSubscriptionSettingsInput
  ): Promise<SubscriptionSettingsShape> {
    const current = await this.getSettings()
    const normalized = normalizeSubscriptionSettingsPayload(input)
    const nextRetryIntervals =
      normalized.dunning_retry_intervals ?? current.dunning_retry_intervals
    const nextMaxAttempts =
      normalized.max_dunning_attempts ?? current.max_dunning_attempts

    if (nextMaxAttempts !== nextRetryIntervals.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "'max_dunning_attempts' must match the number of 'dunning_retry_intervals'"
      )
    }

    const payload = {
      settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
      default_trial_days:
        normalized.default_trial_days ?? current.default_trial_days,
      dunning_retry_intervals: nextRetryIntervals,
      max_dunning_attempts: nextMaxAttempts,
      default_renewal_behavior:
        normalized.default_renewal_behavior ??
        current.default_renewal_behavior,
      default_cancellation_behavior:
        normalized.default_cancellation_behavior ??
        current.default_cancellation_behavior,
      version: current.version + 1,
      updated_by: normalized.updated_by ?? null,
      metadata: normalized.metadata ?? current.metadata ?? null,
    }

    if (current.is_persisted) {
      const [record] = (await this.listSubscriptionSettings({
        settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
      } as any)) as Array<Record<string, any>>

      await this.updateSubscriptionSettings({
        id: record.id,
        ...payload,
      } as any)
    } else {
      await this.createSubscriptionSettings(payload as any)
    }

    return await this.getSettings()
  }

  async resetSettings(): Promise<SubscriptionSettingsShape> {
    const [record] = (await this.listSubscriptionSettings({
      settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
    } as any)) as Array<Record<string, any>>

    if (record) {
      await this.deleteSubscriptionSettings(record.id)
    }

    return buildDefaultSubscriptionSettings()
  }
}

export default SettingsModuleService
