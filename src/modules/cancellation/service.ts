import { MedusaService } from "@medusajs/framework/utils"
import CancellationCase from "./models/cancellation-case"
import RetentionOfferEvent from "./models/retention-offer-event"

class CancellationModuleService extends MedusaService({
  CancellationCase,
  RetentionOfferEvent,
}) {}

export default CancellationModuleService
