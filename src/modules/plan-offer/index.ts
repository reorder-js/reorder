import { Module } from "@medusajs/framework/utils"
import PlanOfferModuleService from "./service"

export const PLAN_OFFER_MODULE = "planOffer"

export default Module(PLAN_OFFER_MODULE, {
  service: PlanOfferModuleService,
})
