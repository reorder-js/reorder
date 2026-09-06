import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  listCustomerPaymentMethods,
  resolveCustomerPaymentMethod,
  toPaymentMethodSummary,
} from "../utils/payment-methods"
import type { SubscriptionAccountHolderRecord } from "../types"

type PaymentMethodStub = {
  id: string
  data?: Record<string, unknown> | null
}

function buildContainer(input: {
  accountHolders: SubscriptionAccountHolderRecord[]
  paymentMethodsByProvider: Record<string, PaymentMethodStub[]>
}) {
  const listPaymentMethods = jest.fn(
    async ({ provider_id }: { provider_id: string }) =>
      input.paymentMethodsByProvider[provider_id] ?? []
  )

  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) {
        return {
          graph: async () => ({
            data: [
              {
                id: "cus_1",
                account_holders: input.accountHolders,
              },
            ],
          }),
        }
      }

      if (key === Modules.PAYMENT) {
        return { listPaymentMethods }
      }

      throw new Error(`Unexpected container key '${key}'`)
    },
  } as unknown as MedusaContainer

  return { container, listPaymentMethods }
}

const stripeAccountHolder: SubscriptionAccountHolderRecord = {
  id: "acch_1",
  provider_id: "pp_stripe_stripe",
  external_id: "cus_stripe_1",
  data: { id: "cus_stripe_1" },
}

describe("toPaymentMethodSummary", () => {
  it("normalizes card details exposed by the provider", () => {
    const summary = toPaymentMethodSummary(
      {
        id: "pm_1",
        data: {
          type: "card",
          created: 1_700_000_000,
          card: {
            brand: "visa",
            last4: "4242",
            exp_month: 4,
            exp_year: 2030,
          },
        },
      },
      "pp_stripe_stripe"
    )

    expect(summary).toEqual({
      id: "pm_1",
      provider_id: "pp_stripe_stripe",
      type: "card",
      brand: "visa",
      last4: "4242",
      exp_month: 4,
      exp_year: 2030,
      created_at: 1_700_000_000,
    })
  })

  it("degrades to null fields for providers that expose no card metadata", () => {
    const summary = toPaymentMethodSummary({ id: "pm_2" }, "pp_system_default")

    expect(summary).toEqual({
      id: "pm_2",
      provider_id: "pp_system_default",
      type: null,
      brand: null,
      last4: null,
      exp_month: null,
      exp_year: null,
      created_at: null,
    })
  })

  it("parses numeric card fields returned as strings", () => {
    const summary = toPaymentMethodSummary(
      {
        id: "pm_3",
        data: {
          card: {
            exp_month: "07",
            exp_year: "2031",
          },
        },
      },
      "pp_stripe_stripe"
    )

    expect(summary.exp_month).toEqual(7)
    expect(summary.exp_year).toEqual(2031)
  })
})

describe("listCustomerPaymentMethods", () => {
  it("returns the customer's saved payment methods newest first", async () => {
    const { container } = buildContainer({
      accountHolders: [stripeAccountHolder],
      paymentMethodsByProvider: {
        pp_stripe_stripe: [
          { id: "pm_old", data: { created: 1 } },
          { id: "pm_new", data: { created: 2 } },
        ],
      },
    })

    const summaries = await listCustomerPaymentMethods(container, {
      customer_id: "cus_1",
      provider_id: "pp_stripe_stripe",
    })

    expect(summaries.map((summary) => summary.id)).toEqual([
      "pm_new",
      "pm_old",
    ])
  })

  it("returns an empty list when the customer has no account holder", async () => {
    const { container, listPaymentMethods } = buildContainer({
      accountHolders: [],
      paymentMethodsByProvider: {},
    })

    const summaries = await listCustomerPaymentMethods(container, {
      customer_id: "cus_1",
      provider_id: "pp_stripe_stripe",
    })

    expect(summaries).toEqual([])
    expect(listPaymentMethods).not.toHaveBeenCalled()
  })

  it("ignores account holders of other providers", async () => {
    const { container } = buildContainer({
      accountHolders: [
        stripeAccountHolder,
        {
          id: "acch_2",
          provider_id: "pp_other_other",
          data: { id: "cus_other_1" },
        },
      ],
      paymentMethodsByProvider: {
        pp_stripe_stripe: [{ id: "pm_stripe" }],
        pp_other_other: [{ id: "pm_other" }],
      },
    })

    const summaries = await listCustomerPaymentMethods(container, {
      customer_id: "cus_1",
      provider_id: "pp_stripe_stripe",
    })

    expect(summaries.map((summary) => summary.id)).toEqual(["pm_stripe"])
  })
})

describe("resolveCustomerPaymentMethod", () => {
  it("resolves a payment method the customer owns", async () => {
    const { container } = buildContainer({
      accountHolders: [stripeAccountHolder],
      paymentMethodsByProvider: {
        pp_stripe_stripe: [
          { id: "pm_1", data: { card: { brand: "visa", last4: "4242" } } },
        ],
      },
    })

    const resolved = await resolveCustomerPaymentMethod(container, {
      customer_id: "cus_1",
      provider_id: "pp_stripe_stripe",
      payment_method_id: "pm_1",
    })

    expect(resolved.summary.id).toEqual("pm_1")
    expect(resolved.summary.last4).toEqual("4242")
    expect(resolved.account_holder.id).toEqual("acch_1")
  })

  it("rejects a payment method the customer does not own", async () => {
    const { container } = buildContainer({
      accountHolders: [stripeAccountHolder],
      paymentMethodsByProvider: {
        pp_stripe_stripe: [{ id: "pm_1" }],
      },
    })

    await expect(
      resolveCustomerPaymentMethod(container, {
        customer_id: "cus_1",
        provider_id: "pp_stripe_stripe",
        payment_method_id: "pm_someone_else",
      })
    ).rejects.toThrow(
      "Payment method 'pm_someone_else' is not a saved payment method of customer 'cus_1'"
    )
  })

  it("rejects when the customer has no account holder for the provider", async () => {
    const { container } = buildContainer({
      accountHolders: [],
      paymentMethodsByProvider: {},
    })

    await expect(
      resolveCustomerPaymentMethod(container, {
        customer_id: "cus_1",
        provider_id: "pp_stripe_stripe",
        payment_method_id: "pm_1",
      })
    ).rejects.toThrow(
      "Customer 'cus_1' has no saved payment account holder for provider 'pp_stripe_stripe'"
    )
  })
})
