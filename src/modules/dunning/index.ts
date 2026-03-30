import { Module } from "@medusajs/framework/utils"
import DunningModuleService from "./service"

export const DUNNING_MODULE = "dunning"

export default Module(DUNNING_MODULE, {
  service: DunningModuleService,
})
