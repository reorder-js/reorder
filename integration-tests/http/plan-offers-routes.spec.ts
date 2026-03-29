import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  createAdminAuthHeaders,
  createPlanOfferSeed,
  createProductWithVariant,
} from "../helpers/plan-offer-fixtures"
import { PlanOfferScope } from "../../src/modules/plan-offer/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin subscription offers endpoints", () => {
      it("lists plan offers", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await createPlanOfferSeed(container, {
          name: "PLAN-API-001",
        })

        const response = await api.get(
          "/admin/subscription-offers?limit=10&offset=0&q=PLAN-API-001",
          {
            headers,
          }
        )

        expect(response.status).toEqual(200)
        expect(response.data.plan_offers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "PLAN-API-001",
            }),
          ])
        )
      })

      it("returns plan offer detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const planOffer = await createPlanOfferSeed(container, {
          name: "PLAN-API-002",
        })

        const response = await api.get(
          `/admin/subscription-offers/${planOffer.id}`,
          {
            headers,
          }
        )

        expect(response.status).toEqual(200)
        expect(response.data.plan_offer.id).toEqual(planOffer.id)
      })

      it("returns 404 for missing detail", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)

        await expect(
          api.get("/admin/subscription-offers/po_missing", { headers })
        ).rejects.toMatchObject({
          response: {
            status: 404,
          },
        })
      })

      it("creates, updates, and toggles plan offers", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product, variant } = await createProductWithVariant(container)

        const createResponse = await api.post(
          "/admin/subscription-offers",
          {
            name: "PLAN-API-003",
            scope: "variant",
            product_id: product.id,
            variant_id: variant.id,
            is_enabled: true,
            allowed_frequencies: [
              { interval: "month", value: 1 },
            ],
            discounts: [
              {
                interval: "month",
                frequency_value: 1,
                type: "percentage",
                value: 10,
              },
            ],
            rules: {
              minimum_cycles: 1,
              trial_enabled: false,
              trial_days: null,
              stacking_policy: "allowed",
            },
            metadata: null,
          },
          { headers }
        )

        expect(createResponse.status).toEqual(200)
        const createdId = createResponse.data.plan_offer.id as string

        const updateResponse = await api.post(
          `/admin/subscription-offers/${createdId}`,
          {
            name: "PLAN-API-003-UPDATED",
            allowed_frequencies: [
              { interval: "month", value: 1 },
              { interval: "year", value: 1 },
            ],
            discounts: [
              {
                interval: "month",
                frequency_value: 1,
                type: "percentage",
                value: 15,
              },
              {
                interval: "year",
                frequency_value: 1,
                type: "fixed",
                value: 25,
              },
            ],
            rules: {
              minimum_cycles: 2,
              trial_enabled: true,
              trial_days: 14,
              stacking_policy: "disallow_all",
            },
          },
          { headers }
        )

        expect(updateResponse.status).toEqual(200)
        expect(updateResponse.data.plan_offer.name).toEqual(
          "PLAN-API-003-UPDATED"
        )

        const toggleResponse = await api.post(
          `/admin/subscription-offers/${createdId}/toggle`,
          {
            is_enabled: false,
          },
          { headers }
        )

        expect(toggleResponse.status).toEqual(200)
        expect(toggleResponse.data.plan_offer.is_enabled).toBe(false)
      })

      it("returns 400 for invalid validation payloads", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product } = await createProductWithVariant(container)

        await expect(
          api.post(
            "/admin/subscription-offers",
            {
              name: "PLAN-API-004",
              scope: "variant",
              product_id: product.id,
              is_enabled: true,
              allowed_frequencies: [
                { interval: "month", value: 1 },
              ],
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })
      })

      it("returns domain errors for invalid business cases", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const first = await createProductWithVariant(container)
        const second = await createProductWithVariant(container)

        await expect(
          api.post(
            "/admin/subscription-offers",
            {
              name: "PLAN-API-005",
              scope: "variant",
              product_id: first.product.id,
              variant_id: second.variant.id,
              is_enabled: true,
              allowed_frequencies: [
                { interval: "month", value: 1 },
              ],
            },
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
          },
        })
      })

      it("returns filtered list with correct effective source", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product, variant } = await createProductWithVariant(container)

        await createPlanOfferSeed(container, {
          name: "PLAN-API-LIST-PRODUCT",
          scope: PlanOfferScope.PRODUCT,
          product_id: product.id,
          variant_id: null,
          is_enabled: true,
        })

        await createPlanOfferSeed(container, {
          name: "PLAN-API-LIST-VARIANT",
          scope: PlanOfferScope.VARIANT,
          product_id: product.id,
          variant_id: variant.id,
          is_enabled: true,
        })

        const response = await api.get(
          `/admin/subscription-offers?scope=variant&variant_id=${variant.id}`,
          {
            headers,
          }
        )

        expect(response.status).toEqual(200)
        expect(response.data.plan_offers).toHaveLength(1)
        expect(response.data.plan_offers[0]).toMatchObject({
          name: "PLAN-API-LIST-VARIANT",
          effective_config_summary: expect.objectContaining({
            source_scope: "variant",
          }),
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
