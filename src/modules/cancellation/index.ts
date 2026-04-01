import { Module } from "@medusajs/framework/utils"
import CancellationModuleService from "./service"

export const CANCELLATION_MODULE = "cancellation"

export default Module(CANCELLATION_MODULE, {
  service: CancellationModuleService,
})
