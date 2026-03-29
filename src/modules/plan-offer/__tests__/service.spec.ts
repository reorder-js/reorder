import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { PLAN_OFFER_MODULE } from ".."
import PlanOffer from "../models/plan-offer"
import PlanOfferModuleService from "../service"
import {
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
  PlanOfferStackingPolicy,
} from "../types"

moduleIntegrationTestRunner<PlanOfferModuleService>({
  moduleName: PLAN_OFFER_MODULE,
  moduleModels: [PlanOffer],
  resolve: "./src/modules/plan-offer",
  testSuite: ({ service }) => {
    describe("PlanOfferModuleService", () => {
      it("creates and retrieves a plan offer", async () => {
        const created = await service.createPlanOffers({
          name: "PLAN-MODULE-001",
          scope: PlanOfferScope.PRODUCT,
          product_id: "prod_module_001",
          variant_id: null,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: PlanOfferFrequencyInterval.MONTH,
              value: 1,
            },
          ] as any,
          frequency_intervals: ["month"],
          discount_per_frequency: [
            {
              interval: PlanOfferFrequencyInterval.MONTH,
              value: 1,
              discount_type: PlanOfferDiscountType.PERCENTAGE,
              discount_value: 10,
            },
          ] as any,
          rules: {
            minimum_cycles: 2,
            trial_enabled: false,
            trial_days: null,
            stacking_policy: PlanOfferStackingPolicy.DISALLOW_SUBSCRIPTION_DISCOUNTS,
          } as any,
          metadata: {
            source: "module-test",
          },
        } as any)

        const retrieved = await service.retrievePlanOffer(created.id)

        expect(retrieved.id).toEqual(created.id)
        expect(retrieved.name).toEqual("PLAN-MODULE-001")
        expect(retrieved.frequency_intervals).toEqual(["month"])
      })

      it("updates helper and json fields", async () => {
        const created = await service.createPlanOffers({
          name: "PLAN-MODULE-002",
          scope: PlanOfferScope.VARIANT,
          product_id: "prod_module_002",
          variant_id: "variant_module_002",
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: PlanOfferFrequencyInterval.MONTH,
              value: 1,
            },
          ] as any,
          frequency_intervals: ["month"],
          discount_per_frequency: [] as any,
          rules: null,
          metadata: null,
        } as any)

        await service.updatePlanOffers({
          id: created.id,
          is_enabled: false,
          frequency_intervals: ["month", "year"],
          allowed_frequencies: [
            {
              interval: PlanOfferFrequencyInterval.MONTH,
              value: 1,
            },
            {
              interval: PlanOfferFrequencyInterval.YEAR,
              value: 1,
            },
          ] as any,
        } as any)

        const updated = await service.retrievePlanOffer(created.id)

        expect(updated.is_enabled).toBe(false)
        expect(updated.frequency_intervals).toEqual(["month", "year"])
      })
    })
  },
})

jest.setTimeout(60 * 1000)
