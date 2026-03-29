import { Module } from "@medusajs/framework/utils"
import RenewalModuleService from "./service"

export const RENEWAL_MODULE = "renewal"

export default Module(RENEWAL_MODULE, {
  service: RenewalModuleService,
})
