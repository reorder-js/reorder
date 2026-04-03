import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SETTINGS_MODULE } from "../../modules/settings"
import type SettingsModuleService from "../../modules/settings/service"
import { GLOBAL_SUBSCRIPTION_SETTINGS_KEY } from "../../modules/settings/types"
import { appendSettingsAuditMetadata } from "../../modules/settings/utils/audit"
import type {
  SubscriptionSettingsShape,
  UpdateSubscriptionSettingsInput,
} from "../../modules/settings/utils/normalize-settings"

export type UpdateSubscriptionSettingsStepInput =
  UpdateSubscriptionSettingsInput & {
    expected_version: number
    reason?: string | null
  }

export type UpdateSubscriptionSettingsStepOutput = {
  settings: SubscriptionSettingsShape
}

type UpdateSubscriptionSettingsCompensation =
  | {
      previous: SubscriptionSettingsShape
      created_new_record: false
    }
  | {
      previous: SubscriptionSettingsShape
      created_new_record: true
    }

type PersistedSettingsRecord = Record<string, any>

function buildRestorationPayload(previous: SubscriptionSettingsShape) {
  return {
    settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
    default_trial_days: previous.default_trial_days,
    dunning_retry_intervals: previous.dunning_retry_intervals,
    max_dunning_attempts: previous.max_dunning_attempts,
    default_renewal_behavior: previous.default_renewal_behavior,
    default_cancellation_behavior: previous.default_cancellation_behavior,
    version: previous.version,
    updated_by: previous.updated_by,
    metadata: previous.metadata,
  }
}

export const updateSubscriptionSettingsStep = createStep(
  "update-subscription-settings",
  async function (
    input: UpdateSubscriptionSettingsStepInput,
    { container }
  ) {
    const logger = container.resolve("logger") as {
      info: (message: string) => void
    }
    const settingsModule =
      container.resolve<SettingsModuleService>(SETTINGS_MODULE)

    const previous = await settingsModule.getSettings()

    if (input.expected_version !== previous.version) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `SubscriptionSettings version conflict: expected ${input.expected_version}, current ${previous.version}`
      )
    }

    const changedAt = new Date().toISOString()
    const nextMetadata = appendSettingsAuditMetadata(previous.metadata, {
      previous,
      updated_by: input.updated_by ?? null,
      reason: input.reason ?? null,
      changed_at: changedAt,
    })

    const settings = await settingsModule.updateSettings({
      ...input,
      metadata: nextMetadata,
    })

    logger.info(
      JSON.stringify({
        domain: "settings",
        event: "settings.update",
        outcome: "completed",
        settings_key: settings.settings_key,
        previous_version: previous.version,
        version: settings.version,
        updated_by: settings.updated_by,
        updated_at: settings.updated_at?.toISOString?.() ?? null,
        reason: input.reason ?? null,
      })
    )

    return new StepResponse<
      UpdateSubscriptionSettingsStepOutput,
      UpdateSubscriptionSettingsCompensation
    >(
      {
        settings,
      },
      {
        previous,
        created_new_record: !previous.is_persisted,
      }
    )
  },
  async function (compensation, { container }) {
    if (!compensation) {
      return
    }

    const settingsModule =
      container.resolve<SettingsModuleService>(SETTINGS_MODULE)

    if (compensation.created_new_record) {
      await settingsModule.resetSettings()
      return
    }

    const [record] = (await settingsModule.listSubscriptionSettings({
      settings_key: GLOBAL_SUBSCRIPTION_SETTINGS_KEY,
    } as any)) as PersistedSettingsRecord[]

    if (!record) {
      return
    }

    await settingsModule.updateSubscriptionSettings({
      id: record.id,
      ...buildRestorationPayload(compensation.previous),
    } as any)
  }
)
