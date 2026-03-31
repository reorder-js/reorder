import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { IPaymentModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DUNNING_MODULE } from "../../src/modules/dunning"
import type DunningModuleService from "../../src/modules/dunning/service"
import { DunningCaseStatus } from "../../src/modules/dunning/types"
import { RENEWAL_MODULE } from "../../src/modules/renewal"
import type RenewalModuleService from "../../src/modules/renewal/service"
import {
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"
import type SubscriptionModuleService from "../../src/modules/subscription/service"
import { SubscriptionStatus } from "../../src/modules/subscription/types"
import {
  processRenewalCycleWorkflow,
  runDunningRetryWorkflow,
} from "../../src/workflows"
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

type PreparedFailureResult = {
  subscription: Awaited<ReturnType<typeof createSubscriptionSeed>>
  cycle: Awaited<ReturnType<typeof createRenewalCycleSeed>>
  dunningCase: {
    id: string
    subscription_id: string
    renewal_cycle_id: string
    renewal_order_id: string | null
    status: DunningCaseStatus
  }
}

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("dunning smoke-check with renewals and subscriptions", () => {
      beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
      })

      async function prepareQualifyingFailedRenewal(
        reference: string,
        options?: {
          paymentFailure?: Error
          orderId?: string
        }
      ): Promise<PreparedFailureResult> {
        const container = getContainer()
        const dunningModule =
          container.resolve<DunningModuleService>(DUNNING_MODULE)
        const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)
        const originalGraph = query.graph.bind(query)
        const orderId = options?.orderId ?? `ord_${reference}`

        const subscription = await createSubscriptionSeed(container, {
          reference,
          status: SubscriptionStatus.ACTIVE,
          cart_id: `cart_${reference}`,
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
                  currency_code: "pln",
                  email: "customer@example.com",
                  customer_id: subscription.customer_id,
                  shipping_address: subscription.shipping_address,
                  billing_address: subscription.shipping_address,
                  items: [
                    {
                      title: "Subscription Product",
                      quantity: 1,
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

          if (input.entity === "order" && ids.includes(orderId)) {
            return {
              data: [{ id: orderId, total: 129 }],
            }
          }

          return originalGraph(input)
        })

        mockCreateOrderRun.mockResolvedValue({
          result: { id: orderId },
        })
        mockCreateOrUpdateOrderPaymentCollectionRun.mockResolvedValue({
          result: [{ id: `paycol_${reference}` }],
        })
        mockCreatePaymentSessionsRun.mockResolvedValue({
          result: { id: `payses_${reference}`, context: {}, status: "pending" },
        })

        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockRejectedValue(
            options?.paymentFailure ?? new Error("Card declined during renewal")
          )

        await expect(
          processRenewalCycleWorkflow(container).run({
            input: {
              renewal_cycle_id: cycle.id,
              trigger_type: "scheduler",
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("declined"),
        })

        const dunningCases = await dunningModule.listDunningCases({
          subscription_id: subscription.id,
        } as any)

        expect(dunningCases).toHaveLength(1)

        return {
          subscription,
          cycle,
          dunningCase: dunningCases[0] as PreparedFailureResult["dunningCase"],
        }
      }

      it("starts dunning from a qualifying failed renewal payment", async () => {
        const container = getContainer()
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)

        const { subscription, cycle, dunningCase } =
          await prepareQualifyingFailedRenewal("SUB-DUN-SMOKE-001")

        const updatedCycle = await renewalModule.retrieveRenewalCycle(cycle.id)
        const attempts = await renewalModule.listRenewalAttempts({
          renewal_cycle_id: cycle.id,
        } as any)
        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )

        expect(updatedCycle).toMatchObject({
          id: cycle.id,
          status: RenewalCycleStatus.FAILED,
          generated_order_id: dunningCase.renewal_order_id,
        })
        expect(attempts).toHaveLength(1)
        expect(attempts[0]).toMatchObject({
          renewal_cycle_id: cycle.id,
          status: RenewalAttemptStatus.FAILED,
          order_id: dunningCase.renewal_order_id,
        })
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.PAST_DUE)
        expect(dunningCase).toMatchObject({
          subscription_id: subscription.id,
          renewal_cycle_id: cycle.id,
          status: DunningCaseStatus.RETRY_SCHEDULED,
        })
      })

      it("recovers the case and restores the subscription after payment retry succeeds", async () => {
        const container = getContainer()
        const dunningModule =
          container.resolve<DunningModuleService>(DUNNING_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)

        const { subscription, dunningCase } =
          await prepareQualifyingFailedRenewal("SUB-DUN-SMOKE-002")

        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockResolvedValue({ id: "pay_smoke_recovered", amount: 129 } as any)
        jest
          .spyOn(paymentModule, "capturePayment")
          .mockResolvedValue({ id: "pay_smoke_recovered" } as any)

        const { result } = await runDunningRetryWorkflow(container).run({
          input: {
            dunning_case_id: dunningCase.id,
            ignore_schedule: true,
            triggered_by: "smoke_test",
          },
        })

        const updatedCase = await dunningModule.retrieveDunningCase(dunningCase.id)
        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )

        expect(result).toMatchObject({
          dunning_case_id: dunningCase.id,
          outcome: "recovered",
          subscription_status: SubscriptionStatus.ACTIVE,
        })
        expect(updatedCase).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.RECOVERED,
          recovery_reason: "payment_recovered",
        })
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.ACTIVE)
      })

      it("closes the case as unrecovered and keeps the subscription past_due after permanent retry failure", async () => {
        const container = getContainer()
        const dunningModule =
          container.resolve<DunningModuleService>(DUNNING_MODULE)
        const subscriptionModule =
          container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
        const renewalModule =
          container.resolve<RenewalModuleService>(RENEWAL_MODULE)
        const paymentModule =
          container.resolve<IPaymentModuleService>(Modules.PAYMENT)

        const { subscription, cycle, dunningCase } =
          await prepareQualifyingFailedRenewal("SUB-DUN-SMOKE-003")

        jest
          .spyOn(paymentModule, "authorizePaymentSession")
          .mockRejectedValue(new Error("Card declined again during dunning"))

        const { result } = await runDunningRetryWorkflow(container).run({
          input: {
            dunning_case_id: dunningCase.id,
            ignore_schedule: true,
            triggered_by: "smoke_test",
          },
        })

        const updatedCase = await dunningModule.retrieveDunningCase(dunningCase.id)
        const updatedSubscription = await subscriptionModule.retrieveSubscription(
          subscription.id
        )
        const updatedCycle = await renewalModule.retrieveRenewalCycle(cycle.id)

        expect(result).toMatchObject({
          dunning_case_id: dunningCase.id,
          outcome: "unrecovered",
          subscription_status: SubscriptionStatus.PAST_DUE,
        })
        expect(updatedCase).toMatchObject({
          id: dunningCase.id,
          status: DunningCaseStatus.UNRECOVERED,
          recovery_reason: "permanent_payment_failure",
        })
        expect(updatedSubscription.status).toEqual(SubscriptionStatus.PAST_DUE)
        expect(updatedCycle.status).toEqual(RenewalCycleStatus.FAILED)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
