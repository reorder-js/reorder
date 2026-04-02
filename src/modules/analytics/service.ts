import { MedusaService } from "@medusajs/framework/utils"
import SubscriptionMetricsDaily from "./models/subscription-metrics-daily"

class AnalyticsModuleService extends MedusaService({
  SubscriptionMetricsDaily,
}) {}

export default AnalyticsModuleService
