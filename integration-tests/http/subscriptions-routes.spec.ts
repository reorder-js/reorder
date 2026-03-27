import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createAdminAuthHeaders,
  createProductWithVariant,
  createSubscriptionSeed,
} from "../helpers/subscription-fixtures"
import { SubscriptionStatus } from "../../src/modules/subscription/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscriptions endpoints", () => {
      it("lists subscriptions", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await createSubscriptionSeed(container, {
          reference: "SUB-API-001",
        })

        const response = await api.get("/admin/subscriptions?limit=10&offset=0", {
          headers,
        })

        expect(response.status).toEqual(200)
        expect(response.data).toHaveProperty("subscriptions")
        expect(response.data).toHaveProperty("count")
      })

      it("returns subscription detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-002",
        })

        const response = await api.get(
          `/admin/subscriptions/${subscription.id}`,
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription.id).toEqual(subscription.id)
      })

      it("returns 404 for missing subscription detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.get("/admin/subscriptions/sub_missing", { headers })
        ).rejects.toMatchObject({
          response: {
            status: 404,
          },
        })
      })

      it("pauses and resumes a subscription", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-003",
          status: SubscriptionStatus.ACTIVE,
        })

        const pauseResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/pause`,
          { reason: "manual api test" },
          { headers }
        )

        expect(pauseResponse.status).toEqual(200)
        expect(pauseResponse.data.subscription.status).toEqual("paused")

        const resumeResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/resume`,
          { preserve_billing_anchor: true },
          { headers }
        )

        expect(resumeResponse.status).toEqual(200)
        expect(resumeResponse.data.subscription.status).toEqual("active")
      })

      it("returns 409 for invalid state transition", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-004",
          status: SubscriptionStatus.PAUSED,
        })

        await expect(
          api.post(
            `/admin/subscriptions/${subscription.id}/pause`,
            {},
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 409,
          },
        })
      })

      it("cancels a subscription", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-005",
          status: SubscriptionStatus.ACTIVE,
        })

        const response = await api.post(
          `/admin/subscriptions/${subscription.id}/cancel`,
          { effective_at: "immediately" },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription.status).toEqual("cancelled")
      })

      it("schedules a plan change", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product, variant } = await createProductWithVariant(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-006",
          product_id: product.id,
          variant_id: variant.id,
        })

        const response = await api.post(
          `/admin/subscriptions/${subscription.id}/schedule-plan-change`,
          {
            variant_id: variant.id,
            frequency_interval: "month",
            frequency_value: 2,
          },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription.pending_update_data).toMatchObject({
          variant_id: variant.id,
          frequency_value: 2,
        })
      })

      it("updates shipping address", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-007",
        })

        const response = await api.post(
          `/admin/subscriptions/${subscription.id}/update-shipping-address`,
          {
            first_name: "Anna",
            last_name: "Nowak",
            company: null,
            address_1: "Nowa 2",
            address_2: null,
            city: "Krakow",
            postal_code: "30-001",
            province: "Malopolskie",
            country_code: "PL",
            phone: "+48111111111",
          },
          { headers }
        )

        expect(response.status).toEqual(200)
        expect(response.data.subscription.shipping_address.city).toEqual(
          "Krakow"
        )
      })

      it("returns validation error for invalid shipping address payload", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-API-008",
        })

        await expect(
          api.post(
            `/admin/subscriptions/${subscription.id}/update-shipping-address`,
            {
              first_name: "Anna",
              last_name: "Nowak",
              address_1: "Nowa 2",
              city: "Krakow",
              postal_code: "30-001",
              country_code: "POL",
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
