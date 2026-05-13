import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import { PlanOfferScope } from "../../src/modules/plan-offer/types"
import { processRenewalCycleWorkflow } from "../../src/workflows"
import {
  createRenewalCycleSeed,
  createSubscriptionSeed,
} from "../helpers/renewal-fixtures"
import { createPlanOfferSeed } from "../helpers/plan-offer-fixtures"
import { FrequencyInterval } from "../../src/common/types/frequency-interval"

const mockCreateOrderRun = jest.fn()
const mockCreateOrUpdateOrderPaymentCollectionRun = jest.fn()
const mockCreatePaymentSessionsRun = jest.fn()

jest.mock("@medusajs/medusa/core-flows", () => {
  const actual = jest.requireActual("@medusajs/medusa/core-flows")

  return {
    ...actual,
    createOrderWorkflow: () => ({
      run: mockCreateOrderRun,
    }),
    createOrUpdateOrderPaymentCollectionWorkflow: () => ({
      run: mockCreateOrUpdateOrderPaymentCollectionRun,
    }),
    createPaymentSessionsWorkflow: () => ({
      run: mockCreatePaymentSessionsRun,
    }),
  }
})

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("renewals source_snapshot pricing behavior", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      it("uses source_snapshot pricing for normal renewal without pending changes", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)

        const productId = "prod_snap_normal"
        const variantId = "variant_snap_normal"

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SNAP-NORMAL-001",
          skip_next_cycle: false,
          product_id: productId,
          variant_id: variantId,
          source_snapshot: {
            product_id: productId,
            variant_id: variantId,
            title: "Snapshot Product",
            subtitle: null,
            quantity: 1,
            unit_price: 5000,
            sku: "SNAP-SKU-001",
            is_discountable: true,
            is_tax_inclusive: false,
            requires_shipping: true,
            tax_lines: [],
            adjustments: [],
          },
        })

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
          scheduled_for: new Date("2026-05-01T10:00:00.000Z"),
        })

        const orderId = "ord_snap_normal_001"

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "cart") {
            return {
              data: [
                {
                  id: subscription.cart_id,
                  region_id: "reg_test",
                  sales_channel_id: "sc_test",
                  currency_code: "pln",
                  email: "customer@example.com",
                  customer_id: subscription.customer_id,
                  shipping_address: { first_name: "Jan", last_name: "Kowalski", country_code: "PL" },
                  billing_address: null,
                  items: [
                    {
                      title: "Cart Product",
                      quantity: 1,
                      unit_price: 9999,
                      variant_id: subscription.variant_id,
                      variant_title: "Cart Variant",
                      variant_sku: "CART-SKU",
                      requires_shipping: true,
                      is_discountable: true,
                    },
                  ],
                  shipping_methods: [],
                },
              ],
            }
          }

          if (input.entity === "order") {
            return {
              data: [{ id: orderId, total: 0 }],
            }
          }

          return { data: [] }
        })

        mockCreateOrderRun.mockResolvedValue({
          result: { id: orderId },
        })

        await processRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            trigger_type: "scheduler",
          },
        })

        expect(mockCreateOrderRun).toHaveBeenCalledTimes(1)
        const orderInput = mockCreateOrderRun.mock.calls[0][0].input
        expect(orderInput.items[0]).toMatchObject({
          product_id: productId,
          variant_id: variantId,
          title: "Snapshot Product",
          unit_price: 5000,
          quantity: 1,
        })

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        expect(updatedSubscription.source_snapshot).toMatchObject({
          product_id: productId,
          variant_id: variantId,
          title: "Snapshot Product",
          unit_price: 5000,
        })
      })

      it("creates variant-linked order when pending plan change is applied", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)

        const productId = "prod_snap_pending"
        const oldVariantId = "variant_old"
        const newVariantId = "variant_new"

        await createPlanOfferSeed(container, {
          name: "Plan Offer for Pending Change",
          scope: PlanOfferScope.VARIANT,
          product_id: productId,
          variant_id: newVariantId,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: FrequencyInterval.MONTH,
              value: 1,
            },
          ],
        })

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SNAP-PENDING-001",
          skip_next_cycle: false,
          product_id: productId,
          variant_id: oldVariantId,
          source_snapshot: {
            product_id: productId,
            variant_id: oldVariantId,
            title: "Old Variant",
            subtitle: null,
            quantity: 1,
            unit_price: 5000,
            sku: "OLD-SKU",
            is_discountable: true,
            is_tax_inclusive: false,
            requires_shipping: true,
            tax_lines: [],
            adjustments: [],
          },
        })

        await subscriptionModule.updateSubscriptions({
          id: subscription.id,
          pending_update_data: {
            variant_id: newVariantId,
            variant_title: "New Variant",
            sku: "NEW-SKU",
            frequency_interval: "month",
            frequency_value: 1,
            effective_at: null,
            requested_at: new Date().toISOString(),
            requested_by: null,
          },
        } as any)

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
          scheduled_for: new Date("2026-05-01T10:00:00.000Z"),
        })

        const orderId = "ord_snap_pending_001"

        const originalGraph = query.graph.bind(query)

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "cart") {
            return {
              data: [
                {
                  id: subscription.cart_id,
                  region_id: "reg_test",
                  sales_channel_id: "sc_test",
                  currency_code: "pln",
                  email: "customer@example.com",
                  customer_id: subscription.customer_id,
                  shipping_address: { first_name: "Jan", last_name: "Kowalski", country_code: "PL" },
                  billing_address: null,
                  items: [
                    {
                      title: "Cart Item",
                      quantity: 1,
                      unit_price: 9999,
                      variant_id: oldVariantId,
                      variant_title: "Old Variant",
                      variant_sku: "OLD-SKU",
                      requires_shipping: true,
                      is_discountable: true,
                    },
                  ],
                  shipping_methods: [],
                },
              ],
            }
          }

          if (input.entity === "order") {
            const fields = input.fields as string[]

            if (fields.includes("items.unit_price")) {
              return {
                data: [
                  {
                    id: orderId,
                    items: [
                      {
                        id: "item_1",
                        title: "New Variant",
                        subtitle: null,
                        quantity: 1,
                        unit_price: 7500,
                        is_discountable: true,
                        is_tax_inclusive: false,
                        requires_shipping: true,
                        variant_sku: "NEW-SKU",
                        product_id: productId,
                        variant_id: newVariantId,
                        tax_lines: [],
                        adjustments: [],
                      },
                    ],
                  },
                ],
              }
            }

            return {
              data: [{ id: orderId, total: 0 }],
            }
          }

          return originalGraph(input)
        })

        mockCreateOrderRun.mockResolvedValue({
          result: { id: orderId },
        })

        await processRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            trigger_type: "scheduler",
          },
        })

        expect(mockCreateOrderRun).toHaveBeenCalledTimes(1)
        const orderInput = mockCreateOrderRun.mock.calls[0][0].input
        expect(orderInput.items[0]).toMatchObject({
          variant_id: newVariantId,
          product_id: productId,
        })
        expect(orderInput.items[0]).not.toHaveProperty("unit_price")

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        expect(updatedSubscription.source_snapshot).toMatchObject({
          product_id: productId,
          variant_id: newVariantId,
          title: "New Variant",
          unit_price: 7500,
          sku: "NEW-SKU",
          quantity: 1,
        })
        expect(updatedSubscription.variant_id).toEqual(newVariantId)
        expect(updatedSubscription.pending_update_data).toBeNull()
      })

      it("uses updated source_snapshot for renewals after a plan change was applied", async () => {
        const container = getContainer()
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)

        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-SNAP-POST-CHANGE-001",
          skip_next_cycle: false,
          source_snapshot: {
            product_id: "prod_post_change",
            variant_id: "variant_post_change",
            title: "New Variant",
            subtitle: null,
            quantity: 1,
            unit_price: 7500,
            sku: "NEW-SKU",
            is_discountable: true,
            is_tax_inclusive: false,
            requires_shipping: true,
            tax_lines: [],
            adjustments: [],
          },
        })

        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
          scheduled_for: new Date("2026-06-01T10:00:00.000Z"),
        })

        const orderId = "ord_snap_post_change_001"

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          if (input.entity === "cart") {
            return {
              data: [
                {
                  id: subscription.cart_id,
                  region_id: "reg_test",
                  sales_channel_id: "sc_test",
                  currency_code: "pln",
                  email: "customer@example.com",
                  customer_id: subscription.customer_id,
                  shipping_address: { first_name: "Jan", last_name: "Kowalski", country_code: "PL" },
                  billing_address: null,
                  items: [
                    {
                      title: "Cart Item",
                      quantity: 1,
                      unit_price: 9999,
                      variant_id: subscription.variant_id,
                      variant_title: "Some Variant",
                      variant_sku: "SOME-SKU",
                      requires_shipping: true,
                      is_discountable: true,
                    },
                  ],
                  shipping_methods: [],
                },
              ],
            }
          }

          if (input.entity === "order") {
            return {
              data: [{ id: orderId, total: 0 }],
            }
          }

          return { data: [] }
        })

        mockCreateOrderRun.mockResolvedValue({
          result: { id: orderId },
        })

        await processRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            trigger_type: "scheduler",
          },
        })

        expect(mockCreateOrderRun).toHaveBeenCalledTimes(1)
        const orderInput = mockCreateOrderRun.mock.calls[0][0].input
        expect(orderInput.items[0]).toMatchObject({
          product_id: "prod_post_change",
          variant_id: "variant_post_change",
          title: "New Variant",
          unit_price: 7500,
          quantity: 1,
        })

        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        expect(updatedSubscription.source_snapshot).toMatchObject({
          product_id: "prod_post_change",
          variant_id: "variant_post_change",
          title: "New Variant",
          unit_price: 7500,
        })
      })
    })
  },
})

jest.setTimeout(60 * 1000)
