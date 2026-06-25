import { buildPaymentContext } from "../validate-subscription-cart"

describe("buildPaymentContext", () => {
  it("stores the account-holder anchor and defers the payment method to backfill", () => {
    const cart = {
      id: "cart_1",
      completed_at: null,
      email: null,
      customer_id: "cus_1",
      customer: {
        id: "cus_1",
        email: null,
        account_holders: [
          {
            id: "acch_1",
            provider_id: "pp_stripe_stripe",
            external_id: "cus_x",
            data: { id: "cus_x" },
          },
        ],
      },
      payment_collection: {
        id: "paycol_1",
        payment_sessions: [{ id: "payses_1", provider_id: "pp_stripe_stripe" }],
      },
    }

    const result = buildPaymentContext(cart)

    expect(result).toEqual({
      payment_provider_id: "pp_stripe_stripe",
      account_holder_id: "acch_1",
      payment_method_id: null,
    })
  })

  it("rejects when the customer has no account holder for the provider", () => {
    const cart = {
      id: "cart_1",
      completed_at: null,
      email: null,
      customer_id: "cus_1",
      customer: {
        id: "cus_1",
        email: null,
        account_holders: [],
      },
      payment_collection: {
        id: "paycol_1",
        payment_sessions: [{ id: "payses_1", provider_id: "pp_stripe_stripe" }],
      },
    }

    expect(() => buildPaymentContext(cart)).toThrow("saved payment account holder")
  })
})
