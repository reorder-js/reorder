import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { IOrderModuleService, IPaymentModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import { RenewalCycleStatus } from "../../src/modules/renewal/types"
import type { SubscriptionPricingSnapshot } from "../../src/modules/subscription/types"
import { processRenewalCycleWorkflow } from "../../src/workflows"
import { createRenewalCycleSeed, createSubscriptionSeed } from "../helpers/renewal-fixtures"

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

const UNIT_PRICE = 100
const QUANTITY = 2

type RenewalOrderOptions = {
  pricing_snapshot: SubscriptionPricingSnapshot | null
  existing_adjustment?: boolean
}

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("renewal orders re-apply the subscription discount", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      // Runs the real renewal step against a real Order module record. Only the
      // order creation and the payment provider calls are stubbed.
      async function runRenewal(reference: string, options: RenewalOrderOptions) {
        const container = getContainer()
        const orderModule = container.resolve<IOrderModuleService>(Modules.ORDER)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const originalGraph = query.graph.bind(query)

        const subscription = await createSubscriptionSeed(container, {
          reference,
          cart_id: `cart_${reference}`,
          pricing_snapshot: options.pricing_snapshot,
        })
        const cycle = await createRenewalCycleSeed(container, {
          subscription_id: subscription.id,
          status: RenewalCycleStatus.SCHEDULED,
          scheduled_for: new Date("2026-04-20T10:00:00.000Z"),
        })

        jest.spyOn(query, "graph").mockImplementation(async (input: any) => {
          const ids = Array.isArray(input?.filters?.id)
            ? input.filters.id
            : [input?.filters?.id].filter(Boolean)

          if (input.entity === "cart" && ids.includes(subscription.cart_id)) {
            return {
              data: [
                {
                  id: subscription.cart_id,
                  region_id: "reg_test",
                  sales_channel_id: "sc_test",
                  currency_code: "usd",
                  email: "customer@example.com",
                  customer_id: subscription.customer_id,
                  shipping_address: subscription.shipping_address,
                  billing_address: subscription.shipping_address,
                  items: [
                    {
                      title: "Subscription Product",
                      quantity: QUANTITY,
                      variant_id: subscription.variant_id,
                      variant_title: subscription.product_snapshot.variant_title,
                      variant_sku: subscription.product_snapshot.sku,
                      requires_shipping: true,
                      is_discountable: true,
                    },
                  ],
                  shipping_methods: [],
                },
              ],
            }
          }

          return originalGraph(input)
        })

        // Renewal orders are rebuilt from the catalog price, so the stubbed
        // order carries no adjustments unless the test asks for one.
        mockCreateOrderRun.mockImplementation(async () => {
          const order = await orderModule.createOrders({
            currency_code: "usd",
            items: [
              {
                title: "Subscription Product",
                quantity: QUANTITY,
                unit_price: UNIT_PRICE,
              },
            ],
          })

          if (options.existing_adjustment) {
            const [item] = (
              await orderModule.retrieveOrder(order.id, { relations: ["items"] })
            ).items ?? []

            await orderModule.upsertOrderLineItemAdjustments([
              {
                item_id: item.id,
                amount: 5,
                code: "subscription_discount",
                provider_id: "subscription_discount",
              },
            ])
          }

          return { result: { id: order.id } }
        })
        mockCreateOrUpdateOrderPaymentCollectionRun.mockResolvedValue({
          result: [{ id: `paycol_${reference}` }],
        })
        mockCreatePaymentSessionsRun.mockResolvedValue({
          result: { id: `payses_${reference}`, context: {}, status: "pending" },
        })
        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockResolvedValue({ id: `pay_${reference}`, amount: 0 } as any)
        jest
          .spyOn(paymentModule, "capturePayment")
          .mockResolvedValue({ id: `pay_${reference}` } as any)

        await processRenewalCycleWorkflow(container).run({
          input: {
            renewal_cycle_id: cycle.id,
            trigger_type: "scheduler",
          },
        })

        const updatedCycle = await renewalModule.retrieveRenewalCycle(cycle.id)

        expect(updatedCycle.status).toEqual(RenewalCycleStatus.SUCCEEDED)
        expect(updatedCycle.generated_order_id).toBeTruthy()

        const { data } = await originalGraph({
          entity: "order",
          fields: [
            "id",
            "total",
            "items.id",
            "items.adjustments.id",
            "items.adjustments.amount",
            "items.adjustments.code",
            "items.adjustments.description",
            "items.adjustments.provider_id",
            "items.adjustments.is_tax_inclusive",
          ],
          filters: { id: [updatedCycle.generated_order_id] },
        })

        return {
          order: data[0] as {
            id: string
            total: number
            items: Array<{
              adjustments: Array<Record<string, unknown>>
            }>
          },
        }
      }

      function chargedAmount() {
        return mockCreateOrUpdateOrderPaymentCollectionRun.mock.calls[0]?.[0]
          ?.input?.amount
      }

      it("applies a percentage discount from the pricing snapshot and charges the discounted total", async () => {
        const { order } = await runRenewal("SUB-REN-DISC-001", {
          pricing_snapshot: {
            discount_type: "percentage",
            discount_value: 10,
            label: "10% off",
          },
        })

        const adjustments = order.items[0].adjustments

        expect(adjustments).toHaveLength(1)
        expect(adjustments[0]).toMatchObject({
          code: "subscription_discount",
          provider_id: "subscription_discount",
          description: "Subscription discount",
          is_tax_inclusive: true,
        })
        expect(Number(adjustments[0].amount)).toEqual(20)
        expect(Number(order.total)).toEqual(180)
        expect(Number(chargedAmount())).toEqual(180)
      })

      it("applies a fixed discount from the pricing snapshot", async () => {
        const { order } = await runRenewal("SUB-REN-DISC-002", {
          pricing_snapshot: {
            discount_type: "fixed",
            discount_value: 15,
            label: "15 off",
          },
        })

        expect(order.items[0].adjustments).toHaveLength(1)
        expect(Number(order.items[0].adjustments[0].amount)).toEqual(15)
        expect(Number(order.total)).toEqual(185)
        expect(Number(chargedAmount())).toEqual(185)
      })

      it("caps a fixed discount at the line total and skips payment for a zero total", async () => {
        const { order } = await runRenewal("SUB-REN-DISC-003", {
          pricing_snapshot: {
            discount_type: "fixed",
            discount_value: 500,
            label: "500 off",
          },
        })

        expect(Number(order.items[0].adjustments[0].amount)).toEqual(
          UNIT_PRICE * QUANTITY
        )
        expect(Number(order.total)).toEqual(0)
        expect(mockCreateOrUpdateOrderPaymentCollectionRun).not.toHaveBeenCalled()
      })

      it("keeps the full catalog price when the subscription has no pricing snapshot", async () => {
        const { order } = await runRenewal("SUB-REN-DISC-004", {
          pricing_snapshot: null,
        })

        expect(order.items[0].adjustments).toHaveLength(0)
        expect(Number(order.total)).toEqual(UNIT_PRICE * QUANTITY)
        expect(Number(chargedAmount())).toEqual(UNIT_PRICE * QUANTITY)
      })

      it("does not add a second discount when the order already carries one", async () => {
        const { order } = await runRenewal("SUB-REN-DISC-005", {
          pricing_snapshot: {
            discount_type: "percentage",
            discount_value: 10,
            label: "10% off",
          },
          existing_adjustment: true,
        })

        expect(order.items[0].adjustments).toHaveLength(1)
        expect(Number(order.items[0].adjustments[0].amount)).toEqual(5)
        expect(Number(order.total)).toEqual(195)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
