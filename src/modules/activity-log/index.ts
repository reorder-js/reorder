import { Module } from "@medusajs/framework/utils"
import ActivityLogModuleService from "./service"

export const ACTIVITY_LOG_MODULE = "activityLog"

export default Module(ACTIVITY_LOG_MODULE, {
  service: ActivityLogModuleService,
})
