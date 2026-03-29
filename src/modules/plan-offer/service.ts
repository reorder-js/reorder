import { MedusaService } from "@medusajs/framework/utils"
import PlanOffer from "./models/plan-offer"

class PlanOfferModuleService extends MedusaService({
  PlanOffer,
}) {}

export default PlanOfferModuleService
