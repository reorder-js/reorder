import { SETTINGS_MODULE } from "../../modules/settings"
import type SettingsModuleService from "../../modules/settings/service"
import {
  buildDefaultSubscriptionSettings,
  type SubscriptionSettingsShape,
} from "../../modules/settings/utils/normalize-settings"

type ResolvableContainer = {
  resolve(key: string): unknown
}

export async function getEffectiveSubscriptionSettings(
  container: ResolvableContainer
): Promise<SubscriptionSettingsShape> {
  const settingsModule = container.resolve(
    SETTINGS_MODULE
  ) as Partial<SettingsModuleService> | undefined

  if (settingsModule && typeof settingsModule.getSettings === "function") {
    return await settingsModule.getSettings()
  }

  return buildDefaultSubscriptionSettings()
}
