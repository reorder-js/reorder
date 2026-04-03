import { MedusaService } from "@medusajs/framework/utils"
import SubscriptionSettings from "./models/subscription-settings"

class SettingsModuleService extends MedusaService({
  SubscriptionSettings,
}) {}

export default SettingsModuleService
