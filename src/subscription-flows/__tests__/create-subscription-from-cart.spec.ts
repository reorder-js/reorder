import { FrequencyInterval } from "../../common/types/frequency-interval"
import {
  advanceCadence,
  buildSubscriptionInput,
} from "../create-subscription-from-cart"

describe("advanceCadence", () => {
  const anchor = new Date("2025-03-15T12:00:00.000Z")

  it("advances by days", () => {
    const result = advanceCadence(anchor, FrequencyInterval.DAY, 3)
    expect(result).toEqual(new Date("2025-03-18T12:00:00.000Z"))
  })

  it("advances by 1 day", () => {
    const result = advanceCadence(anchor, FrequencyInterval.DAY, 1)
    expect(result).toEqual(new Date("2025-03-16T12:00:00.000Z"))
  })

  it("advances by weeks", () => {
    const result = advanceCadence(anchor, FrequencyInterval.WEEK, 2)
    expect(result).toEqual(new Date("2025-03-29T12:00:00.000Z"))
  })

  it("advances by 1 week", () => {
    const result = advanceCadence(anchor, FrequencyInterval.WEEK, 1)
    expect(result).toEqual(new Date("2025-03-22T12:00:00.000Z"))
  })

  it("advances by months", () => {
    const result = advanceCadence(anchor, FrequencyInterval.MONTH, 2)
    expect(result).toEqual(new Date("2025-05-15T12:00:00.000Z"))
  })

  it("advances by 1 month", () => {
    const result = advanceCadence(anchor, FrequencyInterval.MONTH, 1)
    expect(result).toEqual(new Date("2025-04-15T12:00:00.000Z"))
  })

  it("advances by years", () => {
    const result = advanceCadence(anchor, FrequencyInterval.YEAR, 1)
    expect(result).toEqual(new Date("2026-03-15T12:00:00.000Z"))
  })

  it("returns undefined for an unrecognised interval", () => {
    const result = advanceCadence(anchor, "not-valid-interval" as any, 1)
    expect(result).toBeUndefined()
  })
})

describe("buildSubscriptionInput", () => {
  const baseCart = {
    customer_id: "cus_123",
    cart_id: "cart_456",
    customer_snapshot: { email: "test@example.com", full_name: "Test User" },
    product_snapshot: {
      product_id: "prod_1",
      product_title: "Product",
      variant_id: "var_1",
      variant_title: "Variant",
      sku: "SKU-1",
    },
    pricing_snapshot: null,
    source_snapshot: {
      product_id: "prod_1",
      variant_id: "var_1",
      title: "Product - Variant",
      quantity: 1,
      unit_price: 1000,
      subtitle: null,
      sku: "SKU-1",
      is_discountable: true,
      is_tax_inclusive: false,
      requires_shipping: true,
      tax_lines: [],
      adjustments: [],
    },
    shipping_address: {
      first_name: "Test",
      last_name: "User",
      company: null,
      address_1: "Street 1",
      address_2: null,
      city: "City",
      postal_code: "00-000",
      province: "Province",
      country_code: "PL",
      phone: "+48000000000",
    },
    payment_context: {
      payment_provider_id: "pp_stripe_stripe",
      source_payment_collection_id: "paycol_1",
      source_payment_session_id: "payses_1",
      payment_method_reference: "pm_1",
      customer_payment_reference: "cuspay_1",
    },
  }

  const order = {
    id: "order_789",
    display_id: 42,
    created_at: "2025-03-15T12:00:00.000Z",
  }

  function buildInput(
    interval: FrequencyInterval,
    value: number,
    trialDays = 0
  ) {
    return buildSubscriptionInput(
      {
        ...baseCart,
        frequency_interval: interval,
        frequency_value: value,
        trial_days: trialDays,
      },
      order
    )
  }

  describe("non-trial subscriptions", () => {
    it("calculates next_renewal_at for day interval", () => {
      const result = buildInput(FrequencyInterval.DAY, 3)

      expect(result.next_renewal_at).toEqual("2025-03-18T12:00:00.000Z")
      expect(result.is_trial).toBe(false)
      expect(result.trial_ends_at).toBeNull()
      expect(result.frequency_interval).toEqual("day")
      expect(result.frequency_value).toEqual(3)
    })

    it("calculates next_renewal_at for week interval", () => {
      const result = buildInput(FrequencyInterval.WEEK, 2)

      expect(result.next_renewal_at).toEqual("2025-03-29T12:00:00.000Z")
      expect(result.is_trial).toBe(false)
      expect(result.trial_ends_at).toBeNull()
    })

    it("calculates next_renewal_at for month interval", () => {
      const result = buildInput(FrequencyInterval.MONTH, 1)

      expect(result.next_renewal_at).toEqual("2025-04-15T12:00:00.000Z")
      expect(result.is_trial).toBe(false)
      expect(result.trial_ends_at).toBeNull()
    })

    it("calculates next_renewal_at for year interval", () => {
      const result = buildInput(FrequencyInterval.YEAR, 1)

      expect(result.next_renewal_at).toEqual("2026-03-15T12:00:00.000Z")
      expect(result.is_trial).toBe(false)
      expect(result.trial_ends_at).toBeNull()
    })
  })

  describe("trial subscriptions", () => {
    it("sets next_renewal_at to trial end date for day interval", () => {
      const result = buildInput(FrequencyInterval.DAY, 1, 7)

      expect(result.next_renewal_at).toEqual("2025-03-22T12:00:00.000Z")
      expect(result.trial_ends_at).toEqual("2025-03-22T12:00:00.000Z")
      expect(result.is_trial).toBe(true)
    })

    it("sets next_renewal_at to trial end date for month interval", () => {
      const result = buildInput(FrequencyInterval.MONTH, 1, 14)

      expect(result.next_renewal_at).toEqual("2025-03-29T12:00:00.000Z")
      expect(result.trial_ends_at).toEqual("2025-03-29T12:00:00.000Z")
      expect(result.is_trial).toBe(true)
    })
  })

  describe("common output fields", () => {
    it("maps order and cart identifiers", () => {
      const result = buildInput(FrequencyInterval.DAY, 1)

      expect(result.customer_id).toEqual("cus_123")
      expect(result.cart_id).toEqual("cart_456")
      expect(result.order_id).toEqual("order_789")
      expect(result.order_display_id).toEqual(42)
      expect(result.started_at).toEqual("2025-03-15T12:00:00.000Z")
    })

    it("includes snapshots and payment context", () => {
      const result = buildInput(FrequencyInterval.WEEK, 1)

      expect(result.customer_snapshot).toEqual(baseCart.customer_snapshot)
      expect(result.product_snapshot).toEqual(baseCart.product_snapshot)
      expect(result.shipping_address).toEqual(baseCart.shipping_address)
      expect(result.payment_context).toEqual(baseCart.payment_context)
    })
  })

  describe("error handling", () => {
    it("throws for an invalid frequency interval", () => {
      expect(() =>
        buildInput("not-valid-interval" as any, 1)
      ).toThrow("Subscription create flow failed to calculate next renewal date")
    })
  })
})
