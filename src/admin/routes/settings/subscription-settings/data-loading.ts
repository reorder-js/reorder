import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../../lib/client"
import type {
  SubscriptionSettingsAdminResponse,
  UpdateSubscriptionSettingsAdminBody,
} from "../../../types/settings"

export const adminSubscriptionSettingsQueryKeys = {
  all: ["admin", "subscription-settings"] as const,
}

export function useAdminSubscriptionSettingsQuery() {
  return useQuery({
    queryKey: adminSubscriptionSettingsQueryKeys.all,
    queryFn: () =>
      sdk.client.fetch<SubscriptionSettingsAdminResponse>(
        "/admin/subscription-settings"
      ),
  })
}

export async function updateAdminSubscriptionSettings(
  body: UpdateSubscriptionSettingsAdminBody
) {
  return await sdk.client.fetch<SubscriptionSettingsAdminResponse>(
    "/admin/subscription-settings",
    {
      method: "POST",
      body,
    }
  )
}
