import { buildShippingAddressLogStates } from "../update-subscription-shipping-address"

describe("buildShippingAddressLogStates", () => {
  it("marks sensitive address changes through before/after flags", () => {
    const result = buildShippingAddressLogStates(
      {
        first_name: "Test name",
        last_name: "Tester last_name",
        company: null,
        address_1: "New test street 1",
        address_2: null,
        city: "Warsaw",
        postal_code: "60-123",
        province: "Mazowieckie",
        country_code: "pl",
        phone: "+48111111111",
      },
      {
        first_name: "Test name",
        last_name: "Tester last_name",
        company: null,
        address_1: "Kolorowa 15",
        address_2: null,
        city: "Warsaw",
        postal_code: "60-123",
        province: "Mazowieckie",
        country_code: "pl",
        phone: "+48111111111",
      }
    )

    expect(result.previous).toEqual({
      recipient: "Test name Tester last_name",
      address: "New test street 1",
      city: "Warsaw",
      province: "Mazowieckie",
      postal_code_changed: false,
      country_code: "pl",
      phone_changed: false,
    })

    expect(result.current).toEqual({
      recipient: "Test name Tester last_name",
      address: "Kolorowa 15",
      city: "Warsaw",
      province: "Mazowieckie",
      postal_code_changed: false,
      country_code: "pl",
      phone_changed: false,
    })
  })
})
