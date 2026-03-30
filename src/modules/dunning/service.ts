import { MedusaService } from "@medusajs/framework/utils"
import DunningAttempt from "./models/dunning-attempt"
import DunningCase from "./models/dunning-case"

class DunningModuleService extends MedusaService({
  DunningCase,
  DunningAttempt,
}) {}

export default DunningModuleService
