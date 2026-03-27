import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { SUBSCRIPTION_MODULE } from ".."
import Subscription from "../models/subscription"
import SubscriptionModuleService from "../service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../types"

moduleIntegrationTestRunner<SubscriptionModuleService>({
  moduleName: SUBSCRIPTION_MODULE,
  moduleModels: [Subscription],
  resolve: "./src/modules/subscription",
  testSuite: ({ service }) => {
    describe("SubscriptionModuleService", () => {
      it("creates and retrieves a subscription", async () => {
        const created = await service.createSubscriptions({
          reference: "SUB-MODULE-001",
          status: SubscriptionStatus.ACTIVE,
          customer_id: "cus_module_001",
          product_id: "prod_module_001",
          variant_id: "variant_module_001",
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 1,
          started_at: new Date(),
          next_renewal_at: new Date(),
          last_renewal_at: null,
          paused_at: null,
          cancelled_at: null,
          cancel_effective_at: null,
          skip_next_cycle: false,
          is_trial: false,
          trial_ends_at: null,
          customer_snapshot: {
            email: "module@example.com",
            full_name: "Module Test",
          },
          product_snapshot: {
            product_id: "prod_module_001",
            product_title: "Module Product",
            variant_id: "variant_module_001",
            variant_title: "Default Variant",
            sku: "MODULE-SKU-001",
          },
          pricing_snapshot: null,
          shipping_address: {
            first_name: "Jan",
            last_name: "Kowalski",
            company: null,
            address_1: "Testowa 1",
            address_2: null,
            city: "Warszawa",
            postal_code: "00-001",
            province: "Mazowieckie",
            country_code: "PL",
            phone: null,
          },
          pending_update_data: null,
          metadata: null,
        })

        const retrieved = await service.retrieveSubscription(created.id)

        expect(retrieved.id).toEqual(created.id)
        expect(retrieved.reference).toEqual("SUB-MODULE-001")
        expect(retrieved.status).toEqual(SubscriptionStatus.ACTIVE)
      })

      it("updates subscription status", async () => {
        const created = await service.createSubscriptions({
          reference: "SUB-MODULE-002",
          status: SubscriptionStatus.ACTIVE,
          customer_id: "cus_module_002",
          product_id: "prod_module_002",
          variant_id: "variant_module_002",
          frequency_interval: SubscriptionFrequencyInterval.MONTH,
          frequency_value: 1,
          started_at: new Date(),
          next_renewal_at: new Date(),
          last_renewal_at: null,
          paused_at: null,
          cancelled_at: null,
          cancel_effective_at: null,
          skip_next_cycle: false,
          is_trial: false,
          trial_ends_at: null,
          customer_snapshot: {
            email: "module2@example.com",
            full_name: "Module Test 2",
          },
          product_snapshot: {
            product_id: "prod_module_002",
            product_title: "Module Product 2",
            variant_id: "variant_module_002",
            variant_title: "Default Variant",
            sku: "MODULE-SKU-002",
          },
          pricing_snapshot: null,
          shipping_address: {
            first_name: "Jan",
            last_name: "Kowalski",
            company: null,
            address_1: "Testowa 1",
            address_2: null,
            city: "Warszawa",
            postal_code: "00-001",
            province: "Mazowieckie",
            country_code: "PL",
            phone: null,
          },
          pending_update_data: null,
          metadata: null,
        })

        await service.updateSubscriptions({
          id: created.id,
          status: SubscriptionStatus.PAUSED,
          paused_at: new Date(),
        })

        const updated = await service.retrieveSubscription(created.id)

        expect(updated.status).toEqual(SubscriptionStatus.PAUSED)
        expect(updated.paused_at).toBeTruthy()
      })
    })
  },
})

jest.setTimeout(60 * 1000)
