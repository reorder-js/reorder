import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  getAdminPlanOfferDetail,
  listAdminPlanOffers,
  resolveProductSubscriptionConfig,
} from "../../src/modules/plan-offer/utils/admin-query"
import {
  createOrUpsertPlanOfferWorkflow,
  togglePlanOfferWorkflow,
  updatePlanOfferWorkflow,
} from "../../src/workflows"
import {
  createPlanOfferSeed,
  createProductWithVariant,
} from "../helpers/plan-offer-fixtures"
import {
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
  PlanOfferStackingPolicy,
} from "../../src/modules/plan-offer/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("plan offers query and workflows", () => {
      it("lists plan offers with filters and effective config", async () => {
        const container = getContainer()
        const { product, variant } = await createProductWithVariant(container)

        await createPlanOfferSeed(container, {
          name: "PLAN-QUERY-PRODUCT",
          scope: PlanOfferScope.PRODUCT,
          product_id: product.id,
          variant_id: null,
          is_enabled: true,
        })

        await createPlanOfferSeed(container, {
          name: "PLAN-QUERY-VARIANT",
          scope: PlanOfferScope.VARIANT,
          product_id: product.id,
          variant_id: variant.id,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: PlanOfferFrequencyInterval.YEAR,
              value: 1,
            },
          ],
        })

        const response = await listAdminPlanOffers(container, {
          limit: 10,
          offset: 0,
          scope: "variant",
          frequency: "year",
        })

        expect(response.count).toEqual(1)
        expect(response.plan_offers[0]).toMatchObject({
          name: "PLAN-QUERY-VARIANT",
          target: expect.objectContaining({
            variant_id: variant.id,
          }),
          effective_config_summary: expect.objectContaining({
            source_scope: "variant",
          }),
        })
      })

      it("returns detail with effective config fallback", async () => {
        const container = getContainer()
        const { product, variant } = await createProductWithVariant(container)

        const productOffer = await createPlanOfferSeed(container, {
          name: "PLAN-DETAIL-PRODUCT",
          scope: PlanOfferScope.PRODUCT,
          product_id: product.id,
          variant_id: null,
          is_enabled: true,
        })

        const variantOffer = await createPlanOfferSeed(container, {
          name: "PLAN-DETAIL-VARIANT",
          scope: PlanOfferScope.VARIANT,
          product_id: product.id,
          variant_id: variant.id,
          is_enabled: false,
        })

        const detail = await getAdminPlanOfferDetail(container, variantOffer.id)
        const effective = await resolveProductSubscriptionConfig(container, {
          product_id: product.id,
          variant_id: variant.id,
        })

        expect(detail.plan_offer.id).toEqual(variantOffer.id)
        expect(detail.plan_offer.effective_config_summary.source_offer_id).toEqual(
          productOffer.id
        )
        expect(effective.source_offer_id).toEqual(productOffer.id)
        expect(effective.source_scope).toEqual(PlanOfferScope.PRODUCT)
      })

      it("creates, updates, and toggles a plan offer", async () => {
        const container = getContainer()
        const { product, variant } = await createProductWithVariant(container)

        const { result: createdId } = await createOrUpsertPlanOfferWorkflow(
          container
        ).run({
          input: {
            name: "PLAN-WF-001",
            scope: "variant",
            product_id: product.id,
            variant_id: variant.id,
            is_enabled: true,
            allowed_frequencies: [
              {
                interval: "month",
                value: 1,
              },
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
        })

        await updatePlanOfferWorkflow(container).run({
          input: {
            id: createdId as string,
            name: "PLAN-WF-001-UPDATED",
            allowed_frequencies: [
              {
                interval: "month",
                value: 1,
              },
              {
                interval: "year",
                value: 1,
              },
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
        })

        await togglePlanOfferWorkflow(container).run({
          input: {
            id: createdId as string,
            is_enabled: false,
          },
        })

        const detail = await getAdminPlanOfferDetail(container, createdId as string)

        expect(detail.plan_offer).toMatchObject({
          id: createdId,
          name: "PLAN-WF-001-UPDATED",
          is_enabled: false,
          rules: expect.objectContaining({
            trial_enabled: true,
            trial_days: 14,
          }),
        })
      })

      it("rejects invalid frequency mix and product variant mismatch", async () => {
        const container = getContainer()
        const first = await createProductWithVariant(container)
        const second = await createProductWithVariant(container)

        await expect(
          createOrUpsertPlanOfferWorkflow(container).run({
            input: {
              name: "PLAN-WF-ERR-001",
              scope: "product",
              product_id: first.product.id,
              is_enabled: true,
              allowed_frequencies: [
                {
                  interval: "month",
                  value: 1,
                },
                {
                  interval: "month",
                  value: 1,
                },
              ],
              metadata: null,
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("Duplicate frequency"),
        })

        await expect(
          createOrUpsertPlanOfferWorkflow(container).run({
            input: {
              name: "PLAN-WF-ERR-002",
              scope: "variant",
              product_id: first.product.id,
              variant_id: second.variant.id,
              is_enabled: true,
              allowed_frequencies: [
                {
                  interval: "month",
                  value: 1,
                },
              ],
              metadata: null,
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("does not belong"),
        })
      })

      it("rejects discount out of range and upserts an existing target", async () => {
        const container = getContainer()
        const { product } = await createProductWithVariant(container)

        await expect(
          createOrUpsertPlanOfferWorkflow(container).run({
            input: {
              name: "PLAN-WF-ERR-003",
              scope: "product",
              product_id: product.id,
              is_enabled: true,
              allowed_frequencies: [
                {
                  interval: "month",
                  value: 1,
                },
              ],
              discounts: [
                {
                  interval: "month",
                  frequency_value: 1,
                  type: "percentage",
                  value: 101,
                },
              ],
              metadata: null,
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("at most 100"),
        })

        const existing = await createPlanOfferSeed(container, {
          name: "PLAN-UPSERT-EXISTING-001",
          scope: PlanOfferScope.PRODUCT,
          product_id: product.id,
          variant_id: null,
          is_enabled: true,
        })

        const { result: upsertedId } = await createOrUpsertPlanOfferWorkflow(
          container
        ).run({
          input: {
            name: "PLAN-UPSERT-EXISTING-UPDATED",
            scope: "product",
            product_id: product.id,
            is_enabled: false,
            allowed_frequencies: [
              {
                interval: "year",
                value: 1,
              },
            ],
            metadata: {
              source: "upsert-test",
            },
          },
        })

        const detail = await getAdminPlanOfferDetail(container, upsertedId as string)

        expect(upsertedId).toEqual(existing.id)
        expect(detail.plan_offer).toMatchObject({
          id: existing.id,
          name: "PLAN-UPSERT-EXISTING-UPDATED",
          is_enabled: false,
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
