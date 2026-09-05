import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IPaymentModuleService } from "@medusajs/framework/types"
import {
  createAdminAuthHeaders,
  createCustomer,
  createStoreCustomerAuthHeaders,
  createSubscriptionSeed,
} from "../helpers/subscription-fixtures"
import { SubscriptionStatus } from "../../src/modules/subscription/types"

jest.mock("../../src/modules/subscription/utils/payment-methods.ts", () => ({
  ...jest.requireActual("../../src/modules/subscription/utils/payment-methods.ts"),
  listCustomerPaymentMethods: jest.fn().mockResolvedValue([
    {
      id: "pm_123",
      provider_id: "pp_system_default",
      type: "card",
      brand: "visa",
      last4: "4242",
      exp_month: 4,
      exp_year: 2030,
      created_at: 1700000000,
    },
    {
      id: "pm_456",
      provider_id: "pp_system_default",
      type: "card",
      brand: "mastercard",
      last4: "5555",
      exp_month: 12,
      exp_year: 2031,
      created_at: 1700000001,
    },
  ]),
  resolveCustomerPaymentMethod: jest.fn().mockResolvedValue({
    summary: {
      id: "pm_456",
      provider_id: "pp_system_default",
      type: "card",
      brand: "mastercard",
      last4: "5555",
      exp_month: 12,
      exp_year: 2031,
      created_at: 1700000001,
    },
    account_holder: { id: "acch_1", customer_id: "cus_1", provider_id: "pp_system_default" }
  })
}))

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Subscription Payment Methods API", () => {
      jest.setTimeout(30000)
      let customerId: string
      let subscriptionId: string
      let adminHeaders: Record<string, string>
      let storeHeaders: Record<string, string>


      beforeEach(async () => {
        const container = getContainer()
        adminHeaders = await createAdminAuthHeaders(container)

        const customer = await createCustomer(container)
        customerId = customer.id
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const pk = await apiKeyModule.createApiKeys({ title: "test", type: "publishable", created_by: "test" })
        storeHeaders = {
          ...(await createStoreCustomerAuthHeaders(container, customer)),
          "x-publishable-api-key": pk.token
        }
        const subscription = await createSubscriptionSeed(container, {
          customer_id: customerId,
          status: SubscriptionStatus.ACTIVE,
          payment_context: {
            payment_provider_id: "pp_system_default",
            payment_method_reference: "pm_123",
          },
        })
        subscriptionId = Array.isArray(subscription) ? subscription[0].id : subscription.id
        const paymentModule = container.resolve<IPaymentModuleService>(Modules.PAYMENT)
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      describe("Store API", () => {
        it("lists customer payment methods as empty without account holder", async () => {
          const res = await api.get(
            `/store/customers/me/subscriptions/${subscriptionId}/payment-methods`,
            { headers: storeHeaders }
          )

          expect(res.status).toEqual(200)
          expect(res.data.payment_provider_id).toEqual("pp_system_default")
          expect(res.data.payment_methods).toHaveLength(0)
        })

        it("returns 400 when updating to unknown payment method", async () => {
          const res = await api.post(
            `/store/customers/me/subscriptions/${subscriptionId}/payment-method`,
            { payment_method_id: "pm_456" },
            { headers: storeHeaders }
          ).catch((e: any) => e.response)

          expect(res.status).toEqual(400)
        })

        it("returns empty array early if provider_id is null", async () => {
          const container = getContainer()
          const noProviderSub = await createSubscriptionSeed(container, {
            customer_id: customerId,
            status: SubscriptionStatus.ACTIVE,
            payment_context: null,
          })
          const noProviderSubId = Array.isArray(noProviderSub) ? noProviderSub[0].id : noProviderSub.id

          const res = await api.get(
            `/store/customers/me/subscriptions/${noProviderSubId}/payment-methods`,
            { headers: storeHeaders }
          )

          expect(res.status).toEqual(200)
          expect(res.data.payment_provider_id).toBeNull()
          expect(res.data.payment_methods).toEqual([])
        })
      })

      describe("Admin API", () => {
        it("lists customer payment methods as empty without account holder", async () => {
          const res = await api.get(
            `/admin/subscriptions/${subscriptionId}/payment-methods`,
            { headers: adminHeaders }
          )

          expect(res.status).toEqual(200)
          expect(res.data.payment_provider_id).toEqual("pp_system_default")
          expect(res.data.payment_methods).toHaveLength(0)
        })

        it("returns 400 when updating to unknown payment method", async () => {
          const res = await api.post(
            `/admin/subscriptions/${subscriptionId}/payment-method`,
            { payment_method_id: "pm_456" },
            { headers: adminHeaders }
          ).catch((e: any) => e.response)

          expect(res.status).toEqual(400)
        })


        it("returns empty array early if provider_id is null", async () => {
          const container = getContainer()
          const noProviderSub = await createSubscriptionSeed(container, {
            customer_id: customerId,
            status: SubscriptionStatus.ACTIVE,
            payment_context: null,
          })
          const noProviderSubId = Array.isArray(noProviderSub) ? noProviderSub[0].id : noProviderSub.id

          const res = await api.get(
            `/admin/subscriptions/${noProviderSubId}/payment-methods`,
            { headers: adminHeaders }
          )

          expect(res.status).toEqual(200)
          expect(res.data.payment_provider_id).toBeNull()
          expect(res.data.payment_methods).toEqual([])

        })
      })
    })
  },
})