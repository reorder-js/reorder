import {
  normalizeActivityLogEvent,
  buildActivityLogDedupeKey,
} from "../utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../types"

describe("normalizeActivityLogEvent", () => {
  it("builds compact changed_fields from previous and new state", () => {
    const normalized = normalizeActivityLogEvent({
      subscription_id: "sub_123",
      customer_id: "cus_123",
      event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
      actor_type: ActivityLogActorType.USER,
      actor_id: "user_123",
      display: {
        subscription_reference: "SUB-123",
        customer_name: "Jane Doe",
        product_title: "Coffee Club",
        variant_title: "Monthly",
      },
      previous_state: {
        status: "active",
        skip_next_cycle: false,
      },
      new_state: {
        status: "paused",
        skip_next_cycle: false,
      },
      reason: "customer requested a break",
      metadata: {
        source: "admin",
      },
      dedupe: {
        scope: "subscription",
        target_id: "sub_123",
        qualifier: "2026-04-01T10:00:00.000Z",
      },
    })

    expect(normalized.changed_fields).toEqual([
      {
        field: "status",
        before: "active",
        after: "paused",
      },
    ])
  })

  it("redacts sensitive state payload fields", () => {
    const normalized = normalizeActivityLogEvent({
      subscription_id: "sub_123",
      event_type: ActivityLogEventType.SUBSCRIPTION_SHIPPING_ADDRESS_UPDATED,
      actor_type: ActivityLogActorType.USER,
      display: {
        subscription_reference: "SUB-123",
      },
      previous_state: {
        city: "Warsaw",
        address_1: "Hidden Street 1",
        postal_code: "00-001",
        phone: "+48123123123",
      },
      new_state: {
        city: "Krakow",
        address_1: "Hidden Street 2",
        payment_context: {
          payment_method_reference: "pm_secret",
        },
      },
      metadata: {
        order_id: "order_123",
        provider_payload: {
          unsafe: true,
        },
      },
      dedupe: {
        scope: "subscription",
        target_id: "sub_123",
      },
    })

    expect(normalized.previous_state).toEqual({
      city: "Warsaw",
    })
    expect(normalized.new_state).toEqual({
      city: "Krakow",
    })
    expect(normalized.metadata).toEqual({
      order_id: "order_123",
    })
  })

  it("adds correlation_id and filters metadata to an allow-list", () => {
    const normalized = normalizeActivityLogEvent({
      subscription_id: "sub_123",
      event_type: ActivityLogEventType.RENEWAL_FAILED,
      actor_type: ActivityLogActorType.SYSTEM,
      display: {
        subscription_reference: "SUB-123",
      },
      metadata: {
        renewal_cycle_id: "renewal_123",
        attempt_no: 2,
        ignored_key: "drop-me",
      },
      correlation_id: "renewal-force-uuid",
      dedupe: {
        scope: "renewal",
        target_id: "renewal_123",
      },
    })

    expect(normalized.metadata).toEqual({
      renewal_cycle_id: "renewal_123",
      attempt_no: 2,
      correlation_id: "renewal-force-uuid",
    })
  })

  it("builds a stable dedupe key", () => {
    expect(
      buildActivityLogDedupeKey(
        ActivityLogEventType.DUNNING_RETRY_EXECUTED,
        "dunning",
        "dunning_123",
        3
      )
    ).toBe("dunning.retry_executed:dunning:dunning_123:3")
  })

  it("returns null changed_fields when state did not effectively change", () => {
    const normalized = normalizeActivityLogEvent({
      subscription_id: "sub_123",
      event_type: ActivityLogEventType.CANCELLATION_REASON_UPDATED,
      actor_type: ActivityLogActorType.USER,
      display: {
        subscription_reference: "SUB-123",
      },
      previous_state: {
        reason_category: "price",
      },
      new_state: {
        reason_category: "price",
      },
      dedupe: {
        scope: "cancellation",
        target_id: "case_123",
      },
    })

    expect(normalized.changed_fields).toBeNull()
  })
})
