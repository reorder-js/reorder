import { MedusaService } from "@medusajs/framework/utils"
import SubscriptionLog from "./models/subscription-log"

class ActivityLogModuleService extends MedusaService({
  SubscriptionLog,
}) {}

export default ActivityLogModuleService
