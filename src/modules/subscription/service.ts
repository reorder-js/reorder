import { MedusaService } from "@medusajs/framework/utils"
import Subscription from "./models/subscription"

class SubscriptionModuleService extends MedusaService({
  Subscription,
}) {}

export default SubscriptionModuleService
