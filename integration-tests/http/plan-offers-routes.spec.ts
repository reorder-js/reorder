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

      it("covers admin flow from list to create edit save and refresh verification", async () => {
        const container = getContainer()
        const headers = await createAdminAuthHeaders(container)
        const { product, variant } = await createProductWithVariant(container)

        const initialListResponse = await api.get(
          "/admin/subscription-offers?limit=20&offset=0&q=PLAN-ADMIN-FLOW-001",
          {
            headers,
          }
        )

        expect(initialListResponse.status).toEqual(200)
        expect(initialListResponse.data.plan_offers).toHaveLength(0)

        const createResponse = await api.post(
          "/admin/subscription-offers",
          {
            name: "PLAN-ADMIN-FLOW-001",
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
            metadata: {
              source: "admin-flow-test",
            },
          },
          { headers }
        )

        expect(createResponse.status).toEqual(200)
        expect(createResponse.data.plan_offer).toMatchObject({
          name: "PLAN-ADMIN-FLOW-001",
          status: "enabled",
          target: expect.objectContaining({
            scope: "variant",
            product_id: product.id,
            variant_id: variant.id,
          }),
          allowed_frequencies: [
            expect.objectContaining({
              interval: "month",
              value: 1,
              label: "Every month",
            }),
          ],
          discounts: [
            expect.objectContaining({
              interval: "month",
              frequency_value: 1,
              type: "percentage",
              value: 10,
              label: "10% off",
            }),
          ],
          rules: expect.objectContaining({
            minimum_cycles: 1,
            trial_enabled: false,
            trial_days: null,
            stacking_policy: "allowed",
          }),
          metadata: {
            source: "admin-flow-test",
          },
        })

        const createdId = createResponse.data.plan_offer.id as string

        const detailResponse = await api.get(
          `/admin/subscription-offers/${createdId}`,
          {
            headers,
          }
        )

        expect(detailResponse.status).toEqual(200)
        expect(detailResponse.data.plan_offer).toMatchObject({
          id: createdId,
          name: "PLAN-ADMIN-FLOW-001",
          status: "enabled",
        })

        const updateResponse = await api.post(
          `/admin/subscription-offers/${createdId}`,
          {
            name: "PLAN-ADMIN-FLOW-001-UPDATED",
            is_enabled: true,
            allowed_frequencies: [
              { interval: "month", value: 2 },
              { interval: "year", value: 1 },
            ],
            discounts: [
              {
                interval: "month",
                frequency_value: 2,
                type: "percentage",
                value: 12,
              },
              {
                interval: "year",
                frequency_value: 1,
                type: "fixed",
                value: 30,
              },
            ],
            rules: {
              minimum_cycles: 3,
              trial_enabled: true,
              trial_days: 14,
              stacking_policy: "disallow_subscription_discounts",
            },
            metadata: {
              source: "admin-flow-test-updated",
              revision: 2,
            },
          },
          { headers }
        )

        expect(updateResponse.status).toEqual(200)
        expect(updateResponse.data.plan_offer).toMatchObject({
          id: createdId,
          name: "PLAN-ADMIN-FLOW-001-UPDATED",
          status: "enabled",
          allowed_frequencies: [
            expect.objectContaining({
              interval: "month",
              value: 2,
              label: "Every 2 months",
            }),
            expect.objectContaining({
              interval: "year",
              value: 1,
              label: "Every year",
            }),
          ],
          discounts: [
            expect.objectContaining({
              interval: "month",
              frequency_value: 2,
              type: "percentage",
              value: 12,
              label: "12% off",
            }),
            expect.objectContaining({
              interval: "year",
              frequency_value: 1,
              type: "fixed",
              value: 30,
              label: "30 off",
            }),
          ],
          rules: expect.objectContaining({
            minimum_cycles: 3,
            trial_enabled: true,
            trial_days: 14,
            stacking_policy: "disallow_subscription_discounts",
          }),
          metadata: {
            source: "admin-flow-test-updated",
            revision: 2,
          },
        })

        const refreshedDetailResponse = await api.get(
          `/admin/subscription-offers/${createdId}`,
          {
            headers,
          }
        )

        expect(refreshedDetailResponse.status).toEqual(200)
        expect(refreshedDetailResponse.data.plan_offer).toMatchObject({
          id: createdId,
          name: "PLAN-ADMIN-FLOW-001-UPDATED",
          status: "enabled",
          metadata: {
            source: "admin-flow-test-updated",
            revision: 2,
          },
        })
        expect(refreshedDetailResponse.data.plan_offer.allowed_frequencies).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              interval: "month",
              value: 2,
            }),
            expect.objectContaining({
              interval: "year",
              value: 1,
            }),
          ])
        )

        const refreshedListResponse = await api.get(
          "/admin/subscription-offers?limit=20&offset=0&q=PLAN-ADMIN-FLOW-001-UPDATED",
          {
            headers,
          }
        )

        expect(refreshedListResponse.status).toEqual(200)
        expect(refreshedListResponse.data.plan_offers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: createdId,
              name: "PLAN-ADMIN-FLOW-001-UPDATED",
              status: "enabled",
              target: expect.objectContaining({
                scope: "variant",
                product_id: product.id,
                variant_id: variant.id,
              }),
            }),
          ])
        )
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
