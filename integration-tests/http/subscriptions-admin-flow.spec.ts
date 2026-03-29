import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createAdminAuthHeaders,
  createPlanOfferSeed,
  createProductWithVariant,
  createSubscriptionSeed,
} from "../helpers/plan-offer-fixtures"
import { PlanOfferScope } from "../../src/modules/plan-offer/types"
import { SubscriptionStatus } from "../../src/modules/subscription/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscriptions flow", () => {
      it("covers list to detail and all primary admin mutations", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product, variant } = await createProductWithVariant(container)
        await createPlanOfferSeed(container, {
          name: "PLAN-SUB-ADMIN-FLOW-001",
          scope: PlanOfferScope.PRODUCT,
          product_id: product.id,
          variant_id: null,
          is_enabled: true,
          allowed_frequencies: [
            { interval: "month", value: 2 },
          ],
        })

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-ADMIN-FLOW-001",
          status: SubscriptionStatus.ACTIVE,
          product_id: product.id,
          variant_id: variant.id,
        })

        const listResponse = await api.get(
          "/admin/subscriptions?limit=20&offset=0&q=SUB-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(listResponse.status).toEqual(200)
        expect(listResponse.data.subscriptions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: subscription.id,
              reference: "SUB-ADMIN-FLOW-001",
              status: "active",
            }),
          ])
        )

        const detailResponse = await api.get(
          `/admin/subscriptions/${subscription.id}`,
          {
            headers,
          }
        )

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.subscription).toMatchObject({
          id: subscription.id,
          reference: "SUB-ADMIN-FLOW-001",
          status: "active",
        })

        const pauseResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/pause`,
          { reason: "integration admin flow" },
          { headers }
        )

        expect(pauseResponse.status).toEqual(200)
        expect(pauseResponse.data.subscription.status).toEqual("paused")

        const pausedDetailResponse = await api.get(
          `/admin/subscriptions/${subscription.id}`,
          {
            headers,
          }
        )

        expect(pausedDetailResponse.status).toEqual(200)
        expect(pausedDetailResponse.data.subscription.status).toEqual("paused")

        const resumeResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/resume`,
          { preserve_billing_anchor: true },
          { headers }
        )

        expect(resumeResponse.status).toEqual(200)
        expect(resumeResponse.data.subscription.status).toEqual("active")

        const schedulePlanChangeResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/schedule-plan-change`,
          {
            variant_id: variant.id,
            frequency_interval: "month",
            frequency_value: 2,
          },
          { headers }
        )

        expect(schedulePlanChangeResponse.status).toEqual(200)
        expect(
          schedulePlanChangeResponse.data.subscription.pending_update_data
        ).toMatchObject({
          variant_id: variant.id,
          frequency_value: 2,
        })

        const updateShippingAddressResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/update-shipping-address`,
          {
            first_name: "Anna",
            last_name: "Nowak",
            company: "Reorder QA",
            address_1: "Nowa 2",
            address_2: "lok. 4",
            city: "Krakow",
            postal_code: "30-001",
            province: "Malopolskie",
            country_code: "PL",
            phone: "+48111111111",
          },
          { headers }
        )

        expect(updateShippingAddressResponse.status).toEqual(200)
        expect(
          updateShippingAddressResponse.data.subscription.shipping_address
        ).toMatchObject({
          first_name: "Anna",
          last_name: "Nowak",
          city: "Krakow",
          postal_code: "30-001",
          company: "Reorder QA",
        })

        const updatedDetailResponse = await api.get(
          `/admin/subscriptions/${subscription.id}`,
          {
            headers,
          }
        )

        expect(updatedDetailResponse.status).toEqual(200)
        expect(updatedDetailResponse.data.subscription).toMatchObject({
          status: "active",
          pending_update_data: expect.objectContaining({
            variant_id: variant.id,
            frequency_value: 2,
          }),
          shipping_address: expect.objectContaining({
            first_name: "Anna",
            last_name: "Nowak",
            city: "Krakow",
            postal_code: "30-001",
          }),
        })

        const cancelResponse = await api.post(
          `/admin/subscriptions/${subscription.id}/cancel`,
          { effective_at: "immediately" },
          { headers }
        )

        expect(cancelResponse.status).toEqual(200)
        expect(cancelResponse.data.subscription.status).toEqual("cancelled")

        const finalDetailResponse = await api.get(
          `/admin/subscriptions/${subscription.id}`,
          {
            headers,
          }
        )

        expect(finalDetailResponse.status).toEqual(200)
        expect(finalDetailResponse.data.subscription.status).toEqual(
          "cancelled"
        )
      })
    })
  },
})

jest.setTimeout(60 * 1000)
