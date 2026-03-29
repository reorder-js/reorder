import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import {
  getAdminSubscriptionDetail,
  listAdminSubscriptions,
} from "../../src/modules/subscription/utils/admin-query"
import {
  cancelSubscriptionWorkflow,
  pauseSubscriptionWorkflow,
  resumeSubscriptionWorkflow,
  scheduleSubscriptionPlanChangeWorkflow,
  updateSubscriptionShippingAddressWorkflow,
} from "../../src/workflows"
import {
  createPlanOfferSeed,
  createProductWithVariant,
  createSubscriptionSeed,
} from "../helpers/plan-offer-fixtures"
import {
  PlanOfferFrequencyInterval,
  PlanOfferScope,
} from "../../src/modules/plan-offer/types"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../../src/modules/subscription/types"

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("subscriptions query and workflows", () => {
      it("lists subscriptions with pagination and filters", async () => {
        const container = getContainer()

        await createSubscriptionSeed(container, {
          reference: "SUB-QUERY-001",
          status: SubscriptionStatus.ACTIVE,
        })
        await createSubscriptionSeed(container, {
          reference: "SUB-QUERY-002",
          status: SubscriptionStatus.PAUSED,
        })

        const response = await listAdminSubscriptions(container, {
          limit: 10,
          offset: 0,
          status: ["active"],
        })

        expect(response.count).toEqual(1)
        expect(response.subscriptions).toHaveLength(1)
        expect(response.subscriptions[0].reference).toEqual("SUB-QUERY-001")
      })

      it("returns subscription detail", async () => {
        const container = getContainer()
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-DETAIL-001",
        })

        const response = await getAdminSubscriptionDetail(
          container,
          subscription.id
        )

        expect(response.subscription.id).toEqual(subscription.id)
        expect(response.subscription.shipping_address.city).toEqual("Warszawa")
      })

      it("pauses and resumes a subscription", async () => {
        const container = getContainer()
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-WF-001",
          status: SubscriptionStatus.ACTIVE,
        })

        const { result: pausedResult } = await pauseSubscriptionWorkflow(
          container
        ).run({
          input: {
            id: subscription.id,
            reason: "manual test",
          },
        })

        expect(pausedResult.subscription.status).toEqual(
          SubscriptionStatus.PAUSED
        )

        const { result: resumedResult } = await resumeSubscriptionWorkflow(
          container
        ).run({
          input: {
            id: subscription.id,
            preserve_billing_anchor: true,
          },
        })

        expect(resumedResult.subscription.status).toEqual(
          SubscriptionStatus.ACTIVE
        )
      })

      it("throws conflict when pausing a paused subscription", async () => {
        const container = getContainer()
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-WF-002",
          status: SubscriptionStatus.PAUSED,
        })

        await expect(
          pauseSubscriptionWorkflow(container).run({
            input: {
              id: subscription.id,
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("can't be paused"),
        })
      })

      it("cancels a subscription", async () => {
        const container = getContainer()
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-WF-003",
          status: SubscriptionStatus.ACTIVE,
        })

        const { result } = await cancelSubscriptionWorkflow(container).run({
          input: {
            id: subscription.id,
            effective_at: "immediately",
          },
        })

        expect(result.subscription.status).toEqual(
          SubscriptionStatus.CANCELLED
        )
        expect(result.subscription.cancelled_at).toBeTruthy()
      })

      it("schedules a plan change with a real variant", async () => {
        const container = getContainer()
        const { product, variant } = await createProductWithVariant(container)
        await createPlanOfferSeed(container, {
          name: "PLAN-SUB-WF-004",
          scope: PlanOfferScope.VARIANT,
          product_id: product.id,
          variant_id: variant.id,
          is_enabled: true,
          allowed_frequencies: [
            {
              interval: PlanOfferFrequencyInterval.MONTH,
              value: 2,
            },
          ],
        })
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-WF-004",
          product_id: product.id,
          variant_id: variant.id,
        })

        const { result } = await scheduleSubscriptionPlanChangeWorkflow(
          container
        ).run({
          input: {
            id: subscription.id,
            variant_id: variant.id,
            frequency_interval: SubscriptionFrequencyInterval.MONTH,
            frequency_value: 2,
            requested_by: "admin_test",
          },
        })

        expect(result.subscription.pending_update_data).toMatchObject({
          variant_id: variant.id,
          frequency_value: 2,
        })
      })

      it("updates shipping address", async () => {
        const container = getContainer()
        const subscription = await createSubscriptionSeed(container, {
          reference: "SUB-WF-005",
        })

        const { result } = await updateSubscriptionShippingAddressWorkflow(
          container
        ).run({
          input: {
            id: subscription.id,
            first_name: "Anna",
            last_name: "Nowak",
            company: null,
            address_1: "Nowa 2",
            address_2: null,
            city: "Krakow",
            postal_code: "30-001",
            province: "Malopolskie",
            country_code: "PL",
            phone: "+48111111111",
          },
        })

        expect(result.subscription.shipping_address.city).toEqual("Krakow")
      })
    })
  },
})

jest.setTimeout(60 * 1000)
