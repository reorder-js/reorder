import { MedusaService } from "@medusajs/framework/utils"
import RenewalAttempt from "./models/renewal-attempt"
import RenewalCycle from "./models/renewal-cycle"

class RenewalModuleService extends MedusaService({
  RenewalCycle,
  RenewalAttempt,
}) {}

export default RenewalModuleService
