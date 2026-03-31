import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DUNNING_MODULE } from "../src/modules/dunning"
import type DunningModuleService from "../src/modules/dunning/service"
import {
  DunningAttemptStatus,
  DunningCaseStatus,
  type DunningRetrySchedule,
} from "../src/modules/dunning/types"
import { PLAN_OFFER_MODULE } from "../src/modules/plan-offer"
import type PlanOfferModuleService from "../src/modules/plan-offer/service"
import {
  PlanOfferFrequencyInterval,
  PlanOfferScope,
  PlanOfferStackingPolicy,
} from "../src/modules/plan-offer/types"
import { RENEWAL_MODULE } from "../src/modules/renewal"
import type RenewalModuleService from "../src/modules/renewal/service"
import {
  RenewalApprovalStatus,
  RenewalAttemptStatus,
  RenewalCycleStatus,
} from "../src/modules/renewal/types"
import { SUBSCRIPTION_MODULE } from "../src/modules/subscription"
import type SubscriptionModuleService from "../src/modules/subscription/service"
import {
  SubscriptionFrequencyInterval,
  SubscriptionStatus,
} from "../src/modules/subscription/types"

type ProductRecord = {
  id: string
  title: string
  variants?: Array<{
    id: string
    title: string
    sku?: string | null
  }>
}

type PlanOfferRecord = {
  id: string
  product_id: string
  variant_id: string | null
  scope: PlanOfferScope
}

type TargetContext = {
  product_id: string
  product_title: string
  variant_id: string
  variant_title: string
  sku: string | null
}

type SeedSummaryRow = {
  scenario: string
  subscription_reference: string
  renewal_cycle_id?: string
  dunning_case_id?: string
  notes: string
}

const FIXED_TIME = new Date("2026-04-15T10:00:00.000Z")

const IDS = {
  planOfferSuccess: "po_seed_subscriptions_success",
  planOfferBlocked: "po_seed_subscriptions_blocked",
  subSuccess: "sub_seed_subscriptions_success",
  subPaused: "sub_seed_subscriptions_paused",
  subCancelEffective: "sub_seed_subscriptions_cancel_effective",
  subApprovalPending: "sub_seed_subscriptions_approval_pending",
  subPolicyBlocked: "sub_seed_subscriptions_policy_blocked",
  subFailedHistory: "sub_seed_subscriptions_failed_history",
  subDunningRetryScheduled: "sub_seed_dunning_retry_scheduled",
  subDunningAwaitingManual: "sub_seed_dunning_awaiting_manual",
  subDunningRecovered: "sub_seed_dunning_recovered",
  subDunningUnrecovered: "sub_seed_dunning_unrecovered",
  subDunningManualOverride: "sub_seed_dunning_manual_override",
  cycleSuccess: "re_seed_subscriptions_success",
  cyclePaused: "re_seed_subscriptions_paused",
  cycleCancelEffective: "re_seed_subscriptions_cancel_effective",
  cycleApprovalPending: "re_seed_subscriptions_approval_pending",
  cyclePolicyBlocked: "re_seed_subscriptions_policy_blocked",
  cycleFailedHistory: "re_seed_subscriptions_failed_history",
  cycleDunningRetryScheduled: "re_seed_dunning_retry_scheduled",
  cycleDunningAwaitingManual: "re_seed_dunning_awaiting_manual",
  cycleDunningRecovered: "re_seed_dunning_recovered",
  cycleDunningUnrecovered: "re_seed_dunning_unrecovered",
  cycleDunningManualOverride: "re_seed_dunning_manual_override",
  attemptFailedHistory: "rea_seed_subscriptions_failed_history",
  dunningRetryScheduled: "dc_seed_dunning_retry_scheduled",
  dunningAwaitingManual: "dc_seed_dunning_awaiting_manual",
  dunningRecovered: "dc_seed_dunning_recovered",
  dunningUnrecovered: "dc_seed_dunning_unrecovered",
  dunningManualOverride: "dc_seed_dunning_manual_override",
  dunningAttemptAwaitingManual: "da_seed_dunning_awaiting_manual_1",
  dunningAttemptRecoveredFailed: "da_seed_dunning_recovered_1",
  dunningAttemptRecoveredSucceeded: "da_seed_dunning_recovered_2",
  dunningAttemptUnrecoveredOne: "da_seed_dunning_unrecovered_1",
  dunningAttemptUnrecoveredTwo: "da_seed_dunning_unrecovered_2",
  dunningAttemptUnrecoveredThree: "da_seed_dunning_unrecovered_3",
  dunningAttemptManualOverride: "da_seed_dunning_manual_override_1",
} as const

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

async function listProductsWithVariants(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.title", "variants.sku"],
  })

  return (data as ProductRecord[]).filter((product) => product.variants?.length)
}

async function listPlanOfferTargets(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "plan_offer",
    fields: ["id", "product_id", "variant_id", "scope"],
  })

  return data as PlanOfferRecord[]
}

function pickSeedTargets(
  products: ProductRecord[],
  offers: PlanOfferRecord[]
): { success: TargetContext; blocked: TargetContext } {
  const offeredProductIds = new Set(offers.map((offer) => offer.product_id))

  const candidates = products
    .filter((product) => !offeredProductIds.has(product.id))
    .map((product) => {
      const variant = product.variants?.[0]

      if (!variant) {
        return null
      }

      return {
        product_id: product.id,
        product_title: product.title,
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku ?? null,
      } satisfies TargetContext
    })
    .filter(Boolean) as TargetContext[]

  if (candidates.length < 2) {
    throw new Error(
      "Seed requires at least two products with variants that don't already have plan offers."
    )
  }

  return {
    success: candidates[0],
    blocked: candidates[1],
  }
}

function buildSubscriptionRecord(input: {
  id: string
  reference: string
  target: TargetContext
  status: SubscriptionStatus
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  next_renewal_at: Date | null
  skip_next_cycle: boolean
  paused_at?: Date | null
  cancel_effective_at?: Date | null
  pending_update_data?: Record<string, unknown> | null
  cart_id?: string | null
  payment_provider_id?: string | null
}) {
  return {
    id: input.id,
    reference: input.reference,
    status: input.status,
    customer_id: `cus_${input.id}`,
    cart_id: input.cart_id === undefined ? null : input.cart_id,
    product_id: input.target.product_id,
    variant_id: input.target.variant_id,
    frequency_interval: input.frequency_interval,
    frequency_value: input.frequency_value,
    started_at: addDays(FIXED_TIME, -30),
    next_renewal_at: input.next_renewal_at,
    last_renewal_at: null,
    paused_at: input.paused_at === undefined ? null : input.paused_at,
    cancelled_at: null,
    cancel_effective_at:
      input.cancel_effective_at === undefined ? null : input.cancel_effective_at,
    skip_next_cycle: input.skip_next_cycle,
    is_trial: false,
    trial_ends_at: null,
    customer_snapshot: {
      email: `${input.reference.toLowerCase()}@example.com`,
      full_name: `QA ${input.reference}`,
    },
    product_snapshot: {
      product_id: input.target.product_id,
      product_title: input.target.product_title,
      variant_id: input.target.variant_id,
      variant_title: input.target.variant_title,
      sku: input.target.sku,
    },
    pricing_snapshot: {
      discount_type: "percentage",
      discount_value: 10,
      label: "10% off QA seed",
    },
    shipping_address: {
      first_name: "QA",
      last_name: "Tester",
      company: null,
      address_1: "Seed Street 1",
      address_2: null,
      city: "Warsaw",
      postal_code: "00-001",
      province: "Mazowieckie",
      country_code: "PL",
      phone: "+48111111111",
    },
    payment_context: {
      payment_provider_id: input.payment_provider_id ?? "pp_system_default",
      source_payment_collection_id: null,
      source_payment_session_id: null,
      payment_method_reference: null,
      customer_payment_reference: null,
    },
    pending_update_data:
      input.pending_update_data === undefined ? null : input.pending_update_data,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      seed_reference: input.reference,
    },
  }
}

async function upsertPlanOffer(
  service: PlanOfferModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrievePlanOffer(String(input.id))
    return await service.updatePlanOffers(input as any)
  } catch {
    return await service.createPlanOffers(input as any)
  }
}

async function upsertSubscription(
  service: SubscriptionModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveSubscription(String(input.id))
    return await service.updateSubscriptions(input as any)
  } catch {
    return await service.createSubscriptions(input as any)
  }
}

async function upsertRenewalCycle(
  service: RenewalModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveRenewalCycle(String(input.id))
    return await service.updateRenewalCycles(input as any)
  } catch {
    return await service.createRenewalCycles(input as any)
  }
}

async function upsertRenewalAttempt(
  service: RenewalModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveRenewalAttempt(String(input.id))
    return await service.updateRenewalAttempts(input as any)
  } catch {
    return await service.createRenewalAttempts(input as any)
  }
}

async function upsertDunningCase(
  service: DunningModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveDunningCase(String(input.id))
    return await service.updateDunningCases(input as any)
  } catch {
    return await service.createDunningCases(input as any)
  }
}

async function upsertDunningAttempt(
  service: DunningModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveDunningAttempt(String(input.id))
    return await service.updateDunningAttempts(input as any)
  } catch {
    return await service.createDunningAttempts(input as any)
  }
}

function buildRetrySchedule(input?: Partial<DunningRetrySchedule>): DunningRetrySchedule {
  return {
    strategy: "fixed_intervals",
    intervals: input?.intervals ?? [1440, 4320, 10080],
    timezone: "UTC",
    source: input?.source ?? "default_policy",
  }
}

function formatSummary(rows: SeedSummaryRow[]) {
  return rows
    .map((row) => {
      const cyclePart = row.renewal_cycle_id
        ? ` renewal=${row.renewal_cycle_id}`
        : ""
      const dunningPart = row.dunning_case_id
        ? ` dunning=${row.dunning_case_id}`
        : ""

      return `- ${row.scenario}: subscription=${row.subscription_reference}${cyclePart}${dunningPart} | ${row.notes}`
    })
    .join("\n")
}

export default async function seedSubscriptionsTestData({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const planOfferModule =
    container.resolve<PlanOfferModuleService>(PLAN_OFFER_MODULE)
  const subscriptionModule =
    container.resolve<SubscriptionModuleService>(SUBSCRIPTION_MODULE)
  const renewalModule =
    container.resolve<RenewalModuleService>(RENEWAL_MODULE)
  const dunningModule =
    container.resolve<DunningModuleService>(DUNNING_MODULE)

  logger.info("[subscriptions-test-data] Resolving products and existing offers")

  const products = await listProductsWithVariants(container)
  const offers = await listPlanOfferTargets(container)
  const targets = pickSeedTargets(products, offers)

  logger.info(
    `[subscriptions-test-data] Using success target ${targets.success.product_id}/${targets.success.variant_id} and blocked target ${targets.blocked.product_id}/${targets.blocked.variant_id}`
  )

  await upsertPlanOffer(planOfferModule, {
    id: IDS.planOfferSuccess,
    name: "QA Subscriptions Success Offer",
    scope: PlanOfferScope.VARIANT,
    product_id: targets.success.product_id,
    variant_id: targets.success.variant_id,
    is_enabled: true,
    allowed_frequencies: [
      {
        interval: PlanOfferFrequencyInterval.MONTH,
        value: 1,
      },
      {
        interval: PlanOfferFrequencyInterval.MONTH,
        value: 2,
      },
    ],
    frequency_intervals: [PlanOfferFrequencyInterval.MONTH],
    discount_per_frequency: [],
    rules: {
      minimum_cycles: 1,
      trial_enabled: false,
      trial_days: null,
      stacking_policy: PlanOfferStackingPolicy.ALLOWED,
    },
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewals-success",
    },
  })

  await upsertPlanOffer(planOfferModule, {
    id: IDS.planOfferBlocked,
    name: "QA Subscriptions Blocked Offer",
    scope: PlanOfferScope.VARIANT,
    product_id: targets.blocked.product_id,
    variant_id: targets.blocked.variant_id,
    is_enabled: true,
    allowed_frequencies: [
      {
        interval: PlanOfferFrequencyInterval.MONTH,
        value: 1,
      },
    ],
    frequency_intervals: [PlanOfferFrequencyInterval.MONTH],
    discount_per_frequency: [],
    rules: {
      minimum_cycles: 1,
      trial_enabled: false,
      trial_days: null,
      stacking_policy: PlanOfferStackingPolicy.ALLOWED,
    },
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewals-policy-blocked",
    },
  })

  const successScheduledFor = addDays(FIXED_TIME, 2)
  const pausedScheduledFor = addDays(FIXED_TIME, 3)
  const cancelScheduledFor = addDays(FIXED_TIME, 4)
  const approvalScheduledFor = addDays(FIXED_TIME, 5)
  const policyBlockedScheduledFor = addDays(FIXED_TIME, 6)
  const failedHistoryScheduledFor = addDays(FIXED_TIME, -2)
  const dunningRetryScheduledAt = addDays(FIXED_TIME, -1)
  const dunningAwaitingManualAt = addDays(FIXED_TIME, -3)
  const dunningRecoveredAt = addDays(FIXED_TIME, -7)
  const dunningUnrecoveredAt = addDays(FIXED_TIME, -10)
  const dunningManualOverrideAt = addDays(FIXED_TIME, -4)

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subSuccess,
      reference: "SUB-QA-REN-SUCCESS",
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: successScheduledFor,
      skip_next_cycle: true,
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subPaused,
      reference: "SUB-QA-REN-PAUSED",
      target: targets.success,
      status: SubscriptionStatus.PAUSED,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: pausedScheduledFor,
      skip_next_cycle: true,
      paused_at: addDays(FIXED_TIME, -1),
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancelEffective,
      reference: "SUB-QA-REN-CANCEL-EFFECTIVE",
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancelScheduledFor,
      skip_next_cycle: true,
      cancel_effective_at: addDays(cancelScheduledFor, -1),
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subApprovalPending,
      reference: "SUB-QA-REN-APPROVAL-PENDING",
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: approvalScheduledFor,
      skip_next_cycle: true,
      pending_update_data: {
        variant_id: targets.success.variant_id,
        variant_title: targets.success.variant_title,
        sku: targets.success.sku,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 2,
        effective_at: null,
        requested_at: FIXED_TIME.toISOString(),
        requested_by: "qa-seed",
      },
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subPolicyBlocked,
      reference: "SUB-QA-REN-POLICY-BLOCKED",
      target: targets.blocked,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: policyBlockedScheduledFor,
      skip_next_cycle: true,
      pending_update_data: {
        variant_id: targets.blocked.variant_id,
        variant_title: targets.blocked.variant_title,
        sku: targets.blocked.sku,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 2,
        effective_at: null,
        requested_at: FIXED_TIME.toISOString(),
        requested_by: "qa-seed",
      },
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subFailedHistory,
      reference: "SUB-QA-REN-FAILED-HISTORY",
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: failedHistoryScheduledFor,
      skip_next_cycle: false,
      cart_id: null,
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningRetryScheduled,
      reference: "SUB-QA-DUN-RETRY-SCHEDULED",
      target: targets.success,
      status: SubscriptionStatus.PAST_DUE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: addDays(FIXED_TIME, 1),
      skip_next_cycle: false,
      cart_id: "cart_seed_dunning_retry_scheduled",
      payment_provider_id: "pp_stripe_stripe",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningAwaitingManual,
      reference: "SUB-QA-DUN-AWAITING-MANUAL",
      target: targets.success,
      status: SubscriptionStatus.PAST_DUE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: addDays(FIXED_TIME, 2),
      skip_next_cycle: false,
      cart_id: "cart_seed_dunning_awaiting_manual",
      payment_provider_id: "pp_stripe_stripe",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningRecovered,
      reference: "SUB-QA-DUN-RECOVERED",
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: addDays(FIXED_TIME, 14),
      skip_next_cycle: false,
      cart_id: "cart_seed_dunning_recovered",
      payment_provider_id: "pp_adyen_adyen",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningUnrecovered,
      reference: "SUB-QA-DUN-UNRECOVERED",
      target: targets.success,
      status: SubscriptionStatus.PAST_DUE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: addDays(FIXED_TIME, -1),
      skip_next_cycle: false,
      cart_id: "cart_seed_dunning_unrecovered",
      payment_provider_id: "pp_paypal_paypal",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningManualOverride,
      reference: "SUB-QA-DUN-MANUAL-OVERRIDE",
      target: targets.success,
      status: SubscriptionStatus.PAST_DUE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: addDays(FIXED_TIME, 3),
      skip_next_cycle: false,
      cart_id: "cart_seed_dunning_manual_override",
      payment_provider_id: "pp_stripe_stripe",
    })
  )

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleSuccess,
    subscription_id: IDS.subSuccess,
    scheduled_for: successScheduledFor,
    processed_at: null,
    status: RenewalCycleStatus.SCHEDULED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: null,
    attempt_count: 0,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-success",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cyclePaused,
    subscription_id: IDS.subPaused,
    scheduled_for: pausedScheduledFor,
    processed_at: null,
    status: RenewalCycleStatus.SCHEDULED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: null,
    attempt_count: 0,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-paused-block",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancelEffective,
    subscription_id: IDS.subCancelEffective,
    scheduled_for: cancelScheduledFor,
    processed_at: null,
    status: RenewalCycleStatus.SCHEDULED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: null,
    attempt_count: 0,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-cancel-effective-block",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleApprovalPending,
    subscription_id: IDS.subApprovalPending,
    scheduled_for: approvalScheduledFor,
    processed_at: null,
    status: RenewalCycleStatus.SCHEDULED,
    approval_required: true,
    approval_status: RenewalApprovalStatus.PENDING,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: null,
    attempt_count: 0,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-approval-pending",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cyclePolicyBlocked,
    subscription_id: IDS.subPolicyBlocked,
    scheduled_for: policyBlockedScheduledFor,
    processed_at: null,
    status: RenewalCycleStatus.SCHEDULED,
    approval_required: true,
    approval_status: RenewalApprovalStatus.PENDING,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: null,
    attempt_count: 0,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-offer-policy-blocked",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleFailedHistory,
    subscription_id: IDS.subFailedHistory,
    scheduled_for: failedHistoryScheduledFor,
    processed_at: addDays(FIXED_TIME, -1),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: null,
    applied_pending_update_data: null,
    last_error: "Subscription is missing 'cart_id' required for renewal order creation",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-failed-history",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleDunningRetryScheduled,
    subscription_id: IDS.subDunningRetryScheduled,
    scheduled_for: dunningRetryScheduledAt,
    processed_at: addDays(FIXED_TIME, -1),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_dunning_retry_scheduled",
    applied_pending_update_data: null,
    last_error: "Card declined during payment authorization",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-retry-scheduled",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleDunningAwaitingManual,
    subscription_id: IDS.subDunningAwaitingManual,
    scheduled_for: dunningAwaitingManualAt,
    processed_at: addDays(FIXED_TIME, -3),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_dunning_awaiting_manual",
    applied_pending_update_data: null,
    last_error: "Payment requires additional customer authentication",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-awaiting-manual",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleDunningRecovered,
    subscription_id: IDS.subDunningRecovered,
    scheduled_for: dunningRecoveredAt,
    processed_at: addDays(FIXED_TIME, -7),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_dunning_recovered",
    applied_pending_update_data: null,
    last_error: "Initial payment authorization failed before recovery",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-recovered",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleDunningUnrecovered,
    subscription_id: IDS.subDunningUnrecovered,
    scheduled_for: dunningUnrecoveredAt,
    processed_at: addDays(FIXED_TIME, -10),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_dunning_unrecovered",
    applied_pending_update_data: null,
    last_error: "Payment method expired and recovery attempts were exhausted",
    attempt_count: 3,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-unrecovered",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleDunningManualOverride,
    subscription_id: IDS.subDunningManualOverride,
    scheduled_for: dunningManualOverrideAt,
    processed_at: addDays(FIXED_TIME, -4),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_dunning_manual_override",
    applied_pending_update_data: null,
    last_error: "Retry schedule was manually overridden after repeated soft declines",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-manual-override",
    },
  })

  await upsertRenewalAttempt(renewalModule, {
    id: IDS.attemptFailedHistory,
    renewal_cycle_id: IDS.cycleFailedHistory,
    attempt_no: 1,
    started_at: addDays(FIXED_TIME, -1),
    finished_at: addDays(FIXED_TIME, -1),
    status: RenewalAttemptStatus.FAILED,
    error_code: "renewal_failed",
    error_message: "Subscription is missing 'cart_id' required for renewal order creation",
    payment_reference: null,
    order_id: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "renewal-failed-history",
    },
  })

  await upsertDunningCase(dunningModule, {
    id: IDS.dunningRetryScheduled,
    subscription_id: IDS.subDunningRetryScheduled,
    renewal_cycle_id: IDS.cycleDunningRetryScheduled,
    renewal_order_id: "ord_seed_dunning_retry_scheduled",
    status: DunningCaseStatus.RETRY_SCHEDULED,
    attempt_count: 0,
    max_attempts: 3,
    retry_schedule: buildRetrySchedule(),
    next_retry_at: addDays(FIXED_TIME, 1),
    last_payment_error_code: "card_declined",
    last_payment_error_message: "Issuer declined the renewal authorization attempt.",
    last_attempt_at: null,
    recovered_at: null,
    closed_at: null,
    recovery_reason: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-retry-scheduled",
      qa_focus: ["queue", "filters", "retry-now"],
    },
  })

  await upsertDunningCase(dunningModule, {
    id: IDS.dunningAwaitingManual,
    subscription_id: IDS.subDunningAwaitingManual,
    renewal_cycle_id: IDS.cycleDunningAwaitingManual,
    renewal_order_id: "ord_seed_dunning_awaiting_manual",
    status: DunningCaseStatus.AWAITING_MANUAL_RESOLUTION,
    attempt_count: 1,
    max_attempts: 3,
    retry_schedule: buildRetrySchedule(),
    next_retry_at: null,
    last_payment_error_code: "requires_more",
    last_payment_error_message: "Customer action is required before another retry can succeed.",
    last_attempt_at: addDays(FIXED_TIME, -2),
    recovered_at: null,
    closed_at: null,
    recovery_reason: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-awaiting-manual",
      qa_focus: ["detail", "mark-recovered", "mark-unrecovered"],
    },
  })

  await upsertDunningCase(dunningModule, {
    id: IDS.dunningRecovered,
    subscription_id: IDS.subDunningRecovered,
    renewal_cycle_id: IDS.cycleDunningRecovered,
    renewal_order_id: "ord_seed_dunning_recovered",
    status: DunningCaseStatus.RECOVERED,
    attempt_count: 1,
    max_attempts: 3,
    retry_schedule: buildRetrySchedule(),
    next_retry_at: null,
    last_payment_error_code: null,
    last_payment_error_message: null,
    last_attempt_at: addDays(FIXED_TIME, -6),
    recovered_at: addDays(FIXED_TIME, -6),
    closed_at: addDays(FIXED_TIME, -6),
    recovery_reason: "automatic_retry_succeeded",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-recovered",
      qa_focus: ["history", "detail", "terminal-state"],
    },
  })

  await upsertDunningCase(dunningModule, {
    id: IDS.dunningUnrecovered,
    subscription_id: IDS.subDunningUnrecovered,
    renewal_cycle_id: IDS.cycleDunningUnrecovered,
    renewal_order_id: "ord_seed_dunning_unrecovered",
    status: DunningCaseStatus.UNRECOVERED,
    attempt_count: 3,
    max_attempts: 3,
    retry_schedule: buildRetrySchedule(),
    next_retry_at: null,
    last_payment_error_code: "expired_card",
    last_payment_error_message: "The saved payment method expired and recovery attempts were exhausted.",
    last_attempt_at: addDays(FIXED_TIME, -8),
    recovered_at: null,
    closed_at: addDays(FIXED_TIME, -8),
    recovery_reason: "max_attempts_exceeded",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-unrecovered",
      qa_focus: ["history", "filters", "terminal-state"],
    },
  })

  await upsertDunningCase(dunningModule, {
    id: IDS.dunningManualOverride,
    subscription_id: IDS.subDunningManualOverride,
    renewal_cycle_id: IDS.cycleDunningManualOverride,
    renewal_order_id: "ord_seed_dunning_manual_override",
    status: DunningCaseStatus.RETRY_SCHEDULED,
    attempt_count: 1,
    max_attempts: 4,
    retry_schedule: buildRetrySchedule({
      intervals: [720, 1440, 2880, 5760],
      source: "manual_override",
    }),
    next_retry_at: addDays(FIXED_TIME, 2),
    last_payment_error_code: "insufficient_funds",
    last_payment_error_message: "Soft decline after a manual retry schedule override.",
    last_attempt_at: addDays(FIXED_TIME, -3),
    recovered_at: null,
    closed_at: null,
    recovery_reason: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-manual-override",
      qa_focus: ["schedule-override", "filters", "detail"],
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptAwaitingManual,
    dunning_case_id: IDS.dunningAwaitingManual,
    attempt_no: 1,
    started_at: addDays(FIXED_TIME, -2),
    finished_at: addDays(FIXED_TIME, -2),
    status: DunningAttemptStatus.FAILED,
    error_code: "requires_more",
    error_message: "3DS authentication is required before another payment attempt.",
    payment_reference: "pay_seed_dunning_awaiting_manual_1",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-awaiting-manual",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptRecoveredFailed,
    dunning_case_id: IDS.dunningRecovered,
    attempt_no: 1,
    started_at: addDays(FIXED_TIME, -7),
    finished_at: addDays(FIXED_TIME, -7),
    status: DunningAttemptStatus.FAILED,
    error_code: "authentication_required",
    error_message: "Initial recovery attempt required customer authentication.",
    payment_reference: "pay_seed_dunning_recovered_1",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-recovered",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptRecoveredSucceeded,
    dunning_case_id: IDS.dunningRecovered,
    attempt_no: 2,
    started_at: addDays(FIXED_TIME, -6),
    finished_at: addDays(FIXED_TIME, -6),
    status: DunningAttemptStatus.SUCCEEDED,
    error_code: null,
    error_message: null,
    payment_reference: "pay_seed_dunning_recovered_2",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-recovered",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptUnrecoveredOne,
    dunning_case_id: IDS.dunningUnrecovered,
    attempt_no: 1,
    started_at: addDays(FIXED_TIME, -10),
    finished_at: addDays(FIXED_TIME, -10),
    status: DunningAttemptStatus.FAILED,
    error_code: "expired_card",
    error_message: "Retry failed because the stored card was already expired.",
    payment_reference: "pay_seed_dunning_unrecovered_1",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-unrecovered",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptUnrecoveredTwo,
    dunning_case_id: IDS.dunningUnrecovered,
    attempt_no: 2,
    started_at: addDays(FIXED_TIME, -9),
    finished_at: addDays(FIXED_TIME, -9),
    status: DunningAttemptStatus.FAILED,
    error_code: "expired_card",
    error_message: "Second retry failed with the same expired payment method.",
    payment_reference: "pay_seed_dunning_unrecovered_2",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-unrecovered",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptUnrecoveredThree,
    dunning_case_id: IDS.dunningUnrecovered,
    attempt_no: 3,
    started_at: addDays(FIXED_TIME, -8),
    finished_at: addDays(FIXED_TIME, -8),
    status: DunningAttemptStatus.FAILED,
    error_code: "expired_card",
    error_message: "Final retry failed and the case was closed as unrecovered.",
    payment_reference: "pay_seed_dunning_unrecovered_3",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-unrecovered",
    },
  })

  await upsertDunningAttempt(dunningModule, {
    id: IDS.dunningAttemptManualOverride,
    dunning_case_id: IDS.dunningManualOverride,
    attempt_no: 1,
    started_at: addDays(FIXED_TIME, -3),
    finished_at: addDays(FIXED_TIME, -3),
    status: DunningAttemptStatus.FAILED,
    error_code: "insufficient_funds",
    error_message: "Retry failed due to insufficient funds before a manual override was applied.",
    payment_reference: "pay_seed_dunning_manual_override_1",
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "dunning-manual-override",
      manual_override_reason: "Customer requested more time before next retry.",
    },
  })

  const summary: SeedSummaryRow[] = [
    {
      scenario: "Renewal success without approval",
      subscription_reference: "SUB-QA-REN-SUCCESS",
      renewal_cycle_id: IDS.cycleSuccess,
      notes:
        "Active subscription with skip_next_cycle=true. Use Force renewal for a clean success path without order generation.",
    },
    {
      scenario: "Paused subscription block",
      subscription_reference: "SUB-QA-REN-PAUSED",
      renewal_cycle_id: IDS.cyclePaused,
      notes: "Use to verify that renewal respects paused subscription state.",
    },
    {
      scenario: "Cancel effective block",
      subscription_reference: "SUB-QA-REN-CANCEL-EFFECTIVE",
      renewal_cycle_id: IDS.cycleCancelEffective,
      notes: "Use to verify that renewal is blocked when cancel_effective_at is already in effect.",
    },
    {
      scenario: "Approval pending",
      subscription_reference: "SUB-QA-REN-APPROVAL-PENDING",
      renewal_cycle_id: IDS.cycleApprovalPending,
      notes:
        "Use Approve changes or Reject changes from Admin detail. Approved path should later succeed on Force renewal.",
    },
    {
      scenario: "Offer policy blocked after approval",
      subscription_reference: "SUB-QA-REN-POLICY-BLOCKED",
      renewal_cycle_id: IDS.cyclePolicyBlocked,
      notes:
        "Approve changes first, then Force renewal. Execution should be blocked by active plan-offer policy.",
    },
    {
      scenario: "Failed history / retry view",
      subscription_reference: "SUB-QA-REN-FAILED-HISTORY",
      renewal_cycle_id: IDS.cycleFailedHistory,
      notes:
        "Use to inspect failed attempt history and failed cycle UI states.",
    },
    {
      scenario: "Dunning retry scheduled queue item",
      subscription_reference: "SUB-QA-DUN-RETRY-SCHEDULED",
      renewal_cycle_id: IDS.cycleDunningRetryScheduled,
      dunning_case_id: IDS.dunningRetryScheduled,
      notes:
        "Use on Subscriptions > Dunning for queue filters, due retry visibility, and Retry now.",
    },
    {
      scenario: "Dunning awaiting manual resolution",
      subscription_reference: "SUB-QA-DUN-AWAITING-MANUAL",
      renewal_cycle_id: IDS.cycleDunningAwaitingManual,
      dunning_case_id: IDS.dunningAwaitingManual,
      notes:
        "Use on detail page to review failed timeline and test Mark recovered / Mark unrecovered.",
    },
    {
      scenario: "Dunning recovered history",
      subscription_reference: "SUB-QA-DUN-RECOVERED",
      renewal_cycle_id: IDS.cycleDunningRecovered,
      dunning_case_id: IDS.dunningRecovered,
      notes:
        "Use to inspect a completed recovery with failed + successful attempts in the timeline.",
    },
    {
      scenario: "Dunning unrecovered history",
      subscription_reference: "SUB-QA-DUN-UNRECOVERED",
      renewal_cycle_id: IDS.cycleDunningUnrecovered,
      dunning_case_id: IDS.dunningUnrecovered,
      notes:
        "Use to inspect max-attempt exhaustion, terminal unrecovered state, and filters by provider/error code.",
    },
    {
      scenario: "Dunning manual schedule override",
      subscription_reference: "SUB-QA-DUN-MANUAL-OVERRIDE",
      renewal_cycle_id: IDS.cycleDunningManualOverride,
      dunning_case_id: IDS.dunningManualOverride,
      notes:
        "Use to inspect a case with manual_override retry schedule and test the retry schedule drawer.",
    },
  ]

  logger.info("[subscriptions-test-data] Seed completed.")
  logger.info(
    `[subscriptions-test-data] Scenario summary:\n${formatSummary(summary)}`
  )
}
