import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { SETTINGS_MODULE } from "../../../modules/settings"
import type SettingsModuleService from "../../../modules/settings/service"
import {
  type SubscriptionCancellationBehavior,
  type SubscriptionRenewalBehavior,
} from "../../../modules/settings/types"
import { updateSubscriptionSettingsWorkflow } from "../../../workflows"

export type PostAdminSubscriptionSettingsBody = {
  default_trial_days?: number | null
  dunning_retry_intervals?: number[] | null
  max_dunning_attempts?: number | null
  default_renewal_behavior?: SubscriptionRenewalBehavior | null
  default_cancellation_behavior?: SubscriptionCancellationBehavior | null
  expected_version?: number | null
  reason?: string | null
}

function getSettingsModule(container: MedusaContainer) {
  return container.resolve<SettingsModuleService>(SETTINGS_MODULE)
}

export function normalizeAdminSubscriptionSettingsUpdateBody(
  body: PostAdminSubscriptionSettingsBody,
  updatedBy?: string | null
) {
  return {
    default_trial_days: body.default_trial_days ?? undefined,
    dunning_retry_intervals: body.dunning_retry_intervals ?? undefined,
    max_dunning_attempts: body.max_dunning_attempts ?? undefined,
    default_renewal_behavior: body.default_renewal_behavior ?? undefined,
    default_cancellation_behavior:
      body.default_cancellation_behavior ?? undefined,
    expected_version: body.expected_version ?? 0,
    reason: body.reason ?? null,
    updated_by: updatedBy ?? null,
  }
}

export async function getAdminSubscriptionSettingsResponse(
  container: MedusaContainer
) {
  const settingsModule = getSettingsModule(container)

  return {
    subscription_settings: await settingsModule.getSettings(),
  }
}

export async function updateAdminSubscriptionSettingsResponse(
  container: MedusaContainer,
  body: PostAdminSubscriptionSettingsBody,
  updatedBy?: string | null
) {
  const normalized = normalizeAdminSubscriptionSettingsUpdateBody(body, updatedBy)
  const { result } = await updateSubscriptionSettingsWorkflow(container).run({
    input: normalized,
  })

  return {
    subscription_settings: result.settings,
  }
}

export function mapSubscriptionSettingsAdminRouteError(error: unknown) {
  if (error instanceof MedusaError) {
    const typeToStatus: Record<string, number> = {
      [MedusaError.Types.NOT_FOUND]: 404,
      [MedusaError.Types.INVALID_DATA]: 400,
      [MedusaError.Types.CONFLICT]: 409,
    }

    return {
      status: typeToStatus[error.type] ?? 500,
      type: error.type,
      message: error.message,
    }
  }

  const message = error instanceof Error ? error.message : "Settings request failed"
  const normalized = message.toLowerCase()

  if (
    normalized.includes("invalid") ||
    normalized.includes("must be") ||
    normalized.includes("required")
  ) {
    return {
      status: 400,
      type: MedusaError.Types.INVALID_DATA,
      message,
    }
  }

  if (normalized.includes("conflict") || normalized.includes("version")) {
    return {
      status: 409,
      type: MedusaError.Types.CONFLICT,
      message,
    }
  }

  return {
    status: 500,
    type: MedusaError.Types.UNEXPECTED_STATE,
    message,
  }
}
