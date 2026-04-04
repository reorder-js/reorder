import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ACTIVITY_LOG_MODULE } from "../src/modules/activity-log"
import type ActivityLogModuleService from "../src/modules/activity-log/service"
import { ANALYTICS_MODULE } from "../src/modules/analytics"
import { ANALYTICS_METRICS_VERSION } from "../src/modules/analytics/constants"
import type AnalyticsModuleService from "../src/modules/analytics/service"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../src/modules/activity-log/types"
import { CANCELLATION_MODULE } from "../src/modules/cancellation"
import type CancellationModuleService from "../src/modules/cancellation/service"
import {
  CancellationCaseStatus,
  CancellationFinalOutcome,
  CancellationReasonCategory,
  CancellationRecommendedAction,
  RetentionOfferDecisionStatus,
  RetentionOfferType,
} from "../src/modules/cancellation/types"
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
import { SETTINGS_MODULE } from "../src/modules/settings"
import type SettingsModuleService from "../src/modules/settings/service"
import {
  SubscriptionCancellationBehavior,
  SubscriptionRenewalBehavior,
} from "../src/modules/settings/types"

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
  cancellation_case_id?: string
  notes: string
}

type SeedCustomerDefinition = {
  key: string
  reference: string
}

type SeedCustomerRecord = {
  id: string
  email: string
  full_name: string
}

type CustomerModuleService = {
  createCustomers(
    data:
      | Record<string, unknown>
      | Record<string, unknown>[]
  ): Promise<Array<{ id: string; email: string }>>
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
  subCancellationOpenBilling: "sub_seed_cancellation_open_billing",
  subCancellationRetainedDiscount: "sub_seed_cancellation_retained_discount",
  subCancellationPaused: "sub_seed_cancellation_paused",
  subCancellationCanceledImmediate: "sub_seed_cancellation_canceled_immediate",
  subCancellationCanceledEndCycle: "sub_seed_cancellation_canceled_end_cycle",
  subCancellationOpenPrice: "sub_seed_cancellation_open_price",
  subCancellationOpenPaused: "sub_seed_cancellation_open_paused",
  subAnalyticsBiMonthly: "sub_seed_analytics_bimonthly",
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
  cycleCancellationOpenBilling: "re_seed_cancellation_open_billing",
  cycleCancellationRetainedDiscount: "re_seed_cancellation_retained_discount",
  cycleCancellationPaused: "re_seed_cancellation_paused",
  cycleCancellationCanceledImmediate: "re_seed_cancellation_canceled_immediate",
  cycleCancellationCanceledEndCycle: "re_seed_cancellation_canceled_end_cycle",
  cycleCancellationOpenPrice: "re_seed_cancellation_open_price",
  cycleCancellationOpenPaused: "re_seed_cancellation_open_paused",
  attemptFailedHistory: "rea_seed_subscriptions_failed_history",
  dunningRetryScheduled: "dc_seed_dunning_retry_scheduled",
  dunningAwaitingManual: "dc_seed_dunning_awaiting_manual",
  dunningRecovered: "dc_seed_dunning_recovered",
  dunningUnrecovered: "dc_seed_dunning_unrecovered",
  dunningManualOverride: "dc_seed_dunning_manual_override",
  dunningCancellationOpenBilling: "dc_seed_cancellation_open_billing",
  dunningAttemptAwaitingManual: "da_seed_dunning_awaiting_manual_1",
  dunningAttemptRecoveredFailed: "da_seed_dunning_recovered_1",
  dunningAttemptRecoveredSucceeded: "da_seed_dunning_recovered_2",
  dunningAttemptUnrecoveredOne: "da_seed_dunning_unrecovered_1",
  dunningAttemptUnrecoveredTwo: "da_seed_dunning_unrecovered_2",
  dunningAttemptUnrecoveredThree: "da_seed_dunning_unrecovered_3",
  dunningAttemptManualOverride: "da_seed_dunning_manual_override_1",
  cancellationOpenBilling: "cc_seed_cancellation_open_billing",
  cancellationRetainedDiscount: "cc_seed_cancellation_retained_discount",
  cancellationPaused: "cc_seed_cancellation_paused",
  cancellationCanceledImmediate: "cc_seed_cancellation_canceled_immediate",
  cancellationCanceledEndCycle: "cc_seed_cancellation_canceled_end_cycle",
  cancellationOpenPrice: "cc_seed_cancellation_open_price",
  cancellationOpenPaused: "cc_seed_cancellation_open_paused",
  retentionDiscountRetained: "roe_seed_cancellation_discount_retained",
  retentionPauseApplied: "roe_seed_cancellation_pause_applied",
  logSubscriptionPaused: "slog_seed_subscription_paused",
  logRenewalSucceeded: "slog_seed_renewal_succeeded",
  logDunningRecovered: "slog_seed_dunning_recovered",
  settingsGlobal: "set_seed_subscriptions_global",
} as const

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function buildSeedCustomerDefinition(input: SeedCustomerDefinition) {
  return {
    ...input,
    email: `${input.reference.toLowerCase()}@example.com`,
    full_name: `QA ${input.reference}`,
  }
}

async function ensureSeedCustomers(
  container: MedusaContainer,
  definitions: SeedCustomerDefinition[]
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const customerModule =
    container.resolve<CustomerModuleService>(Modules.CUSTOMER)
  const customerDefinitions = definitions.map(buildSeedCustomerDefinition)
  const emailToDefinition = new Map(
    customerDefinitions.map((definition) => [definition.email, definition])
  )

  const { data: existingCustomers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: {
      email: customerDefinitions.map((definition) => definition.email),
    },
  })

  const customerMap = new Map<string, SeedCustomerRecord>()

  for (const customer of (existingCustomers ?? []) as Array<{
    id: string
    email: string
  }>) {
    const definition = emailToDefinition.get(customer.email)

    if (!definition) {
      continue
    }

    customerMap.set(definition.key, {
      id: customer.id,
      email: definition.email,
      full_name: definition.full_name,
    })
  }

  const missingDefinitions = customerDefinitions.filter(
    (definition) => !customerMap.has(definition.key)
  )

  if (missingDefinitions.length) {
    const result = await customerModule.createCustomers(
      missingDefinitions.map((definition) => ({
        email: definition.email,
        first_name: "QA",
        last_name: definition.reference,
        metadata: {
          seed_namespace: "subscriptions-test-data",
          seed_key: definition.key,
          seed_reference: definition.reference,
        },
      }))
    )

    for (const customer of result) {
      const definition = emailToDefinition.get(customer.email)

      if (!definition) {
        continue
      }

      customerMap.set(definition.key, {
        id: customer.id,
        email: definition.email,
        full_name: definition.full_name,
      })
    }
  }

  return customerMap
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
  customer: SeedCustomerRecord
  target: TargetContext
  status: SubscriptionStatus
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  next_renewal_at: Date | null
  skip_next_cycle: boolean
  paused_at?: Date | null
  cancelled_at?: Date | null
  cancel_effective_at?: Date | null
  pending_update_data?: Record<string, unknown> | null
  cart_id?: string | null
  payment_provider_id?: string | null
}) {
  return {
    id: input.id,
    reference: input.reference,
    status: input.status,
    customer_id: input.customer.id,
    cart_id: input.cart_id === undefined ? null : input.cart_id,
    product_id: input.target.product_id,
    variant_id: input.target.variant_id,
    frequency_interval: input.frequency_interval,
    frequency_value: input.frequency_value,
    started_at: addDays(FIXED_TIME, -30),
    next_renewal_at: input.next_renewal_at,
    last_renewal_at: null,
    paused_at: input.paused_at === undefined ? null : input.paused_at,
    cancelled_at: input.cancelled_at === undefined ? null : input.cancelled_at,
    cancel_effective_at:
      input.cancel_effective_at === undefined ? null : input.cancel_effective_at,
    skip_next_cycle: input.skip_next_cycle,
    is_trial: false,
    trial_ends_at: null,
    customer_snapshot: {
      email: input.customer.email,
      full_name: input.customer.full_name,
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

async function upsertCancellationCase(
  service: CancellationModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveCancellationCase(String(input.id))
    return await service.updateCancellationCases(input as any)
  } catch {
    return await service.createCancellationCases(input as any)
  }
}

async function upsertRetentionOfferEvent(
  service: CancellationModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveRetentionOfferEvent(String(input.id))
    return await service.updateRetentionOfferEvents(input as any)
  } catch {
    return await service.createRetentionOfferEvents(input as any)
  }
}

async function upsertSubscriptionLog(
  service: ActivityLogModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveSubscriptionLog(String(input.id))
    return await service.updateSubscriptionLogs(input as any)
  } catch {
    return await service.createSubscriptionLogs(input as any)
  }
}

async function upsertSubscriptionMetricsDaily(
  service: AnalyticsModuleService,
  input: Record<string, unknown>
) {
  try {
    await service.retrieveSubscriptionMetricsDaily(String(input.id))
    return await service.updateSubscriptionMetricsDailies(input as any)
  } catch {
    return await service.createSubscriptionMetricsDailies(input as any)
  }
}

async function upsertSubscriptionSettings(
  service: SettingsModuleService,
  input: Record<string, unknown>
) {
  const [existing] = (await service.listSubscriptionSettings({
    settings_key: "global",
  } as any)) as Array<Record<string, any>>

  if (existing) {
    return await service.updateSubscriptionSettings({
      id: existing.id,
      ...input,
    } as any)
  }

  return await service.createSubscriptionSettings(input as any)
}

function buildAnalyticsSnapshotId(subscriptionId: string, date: string) {
  return `smd_seed_${subscriptionId}_${date}`
}

function buildAnalyticsSnapshotRecord(input: {
  subscription_id: string
  metric_date: string
  customer_id: string
  product_id: string
  variant_id: string
  status: SubscriptionStatus
  frequency_interval: SubscriptionFrequencyInterval
  frequency_value: number
  currency_code: string | null
  active_subscriptions_count: number
  mrr_amount: number | null
  churned_subscriptions_count: number
  churn_reason_category: CancellationReasonCategory | null
  scenario: string
}) {
  return {
    id: buildAnalyticsSnapshotId(input.subscription_id, input.metric_date),
    metric_date: new Date(`${input.metric_date}T00:00:00.000Z`),
    subscription_id: input.subscription_id,
    customer_id: input.customer_id,
    product_id: input.product_id,
    variant_id: input.variant_id,
    status: input.status,
    frequency_interval: input.frequency_interval,
    frequency_value: input.frequency_value,
    currency_code: input.currency_code,
    is_active: input.active_subscriptions_count === 1,
    active_subscriptions_count: input.active_subscriptions_count,
    mrr_amount: input.mrr_amount,
    churned_subscriptions_count: input.churned_subscriptions_count,
    churn_reason_category: input.churn_reason_category,
    source_snapshot: {
      source: "seed-script",
      scenario: input.scenario,
      revenue_source: input.mrr_amount === null ? "seeded-unavailable" : "seeded-fixed-value",
    },
    metadata: {
      seed_namespace: "subscriptions-test-data",
      seed_scenario: input.scenario,
      metrics_version: ANALYTICS_METRICS_VERSION,
    },
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
      const cancellationPart = row.cancellation_case_id
        ? ` cancellation=${row.cancellation_case_id}`
        : ""

      return `- ${row.scenario}: subscription=${row.subscription_reference}${cyclePart}${dunningPart}${cancellationPart} | ${row.notes}`
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
  const cancellationModule =
    container.resolve<CancellationModuleService>(CANCELLATION_MODULE)
  const activityLogModule =
    container.resolve<ActivityLogModuleService>(ACTIVITY_LOG_MODULE)
  const analyticsModule =
    container.resolve<AnalyticsModuleService>(ANALYTICS_MODULE)
  const settingsModule =
    container.resolve<SettingsModuleService>(SETTINGS_MODULE)

  const [existingSettings] = (await settingsModule.listSubscriptionSettings({
    settings_key: "global",
  } as any)) as Array<Record<string, any>>
  const shouldSeedSettings =
    !existingSettings ||
    existingSettings.metadata?.seed_namespace === "subscriptions-test-data"

  if (!shouldSeedSettings) {
    logger.warn(
      "[subscriptions-test-data] Skipping SubscriptionSettings seed because a non-seeded global singleton already exists."
    )
  }

  logger.info("[subscriptions-test-data] Resolving products and existing offers")

  const products = await listProductsWithVariants(container)
  const offers = await listPlanOfferTargets(container)
  const targets = pickSeedTargets(products, offers)
  const customerMap = await ensureSeedCustomers(container, [
    { key: IDS.subSuccess, reference: "SUB-QA-REN-SUCCESS" },
    { key: IDS.subPaused, reference: "SUB-QA-REN-PAUSED" },
    { key: IDS.subCancelEffective, reference: "SUB-QA-REN-CANCEL-EFFECTIVE" },
    { key: IDS.subApprovalPending, reference: "SUB-QA-REN-APPROVAL-PENDING" },
    { key: IDS.subPolicyBlocked, reference: "SUB-QA-REN-POLICY-BLOCKED" },
    { key: IDS.subFailedHistory, reference: "SUB-QA-REN-FAILED-HISTORY" },
    { key: IDS.subDunningRetryScheduled, reference: "SUB-QA-DUN-RETRY-SCHEDULED" },
    { key: IDS.subDunningAwaitingManual, reference: "SUB-QA-DUN-AWAITING-MANUAL" },
    { key: IDS.subDunningRecovered, reference: "SUB-QA-DUN-RECOVERED" },
    { key: IDS.subDunningUnrecovered, reference: "SUB-QA-DUN-UNRECOVERED" },
    { key: IDS.subDunningManualOverride, reference: "SUB-QA-DUN-MANUAL-OVERRIDE" },
    { key: IDS.subCancellationOpenBilling, reference: "SUB-QA-CAN-OPEN-BILLING" },
    { key: IDS.subCancellationRetainedDiscount, reference: "SUB-QA-CAN-RETAINED-DISCOUNT" },
    { key: IDS.subCancellationPaused, reference: "SUB-QA-CAN-PAUSED" },
    { key: IDS.subCancellationCanceledImmediate, reference: "SUB-QA-CAN-CANCELED-IMMEDIATE" },
    { key: IDS.subCancellationCanceledEndCycle, reference: "SUB-QA-CAN-CANCELED-END-CYCLE" },
    { key: IDS.subCancellationOpenPrice, reference: "SUB-QA-CAN-OPEN-PRICE" },
    { key: IDS.subCancellationOpenPaused, reference: "SUB-QA-CAN-OPEN-PAUSED-SUB" },
    { key: IDS.subAnalyticsBiMonthly, reference: "SUB-QA-ANL-BI-MONTHLY" },
  ])

  const getSeedCustomer = (key: string) => {
    const customer = customerMap.get(key)

    if (!customer) {
      throw new Error(`Seed customer missing for ${key}`)
    }

    return customer
  }

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

  if (shouldSeedSettings) {
    await upsertSubscriptionSettings(settingsModule, {
      id: existingSettings?.id ?? IDS.settingsGlobal,
      settings_key: "global",
      default_trial_days: 14,
      dunning_retry_intervals: [60, 180, 720],
      max_dunning_attempts: 3,
      default_renewal_behavior:
        SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
      default_cancellation_behavior:
        SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
      version: 1,
      updated_by: "qa-seed",
      metadata: {
        seed_namespace: "subscriptions-test-data",
        scenario: "settings-global-defaults",
        audit_log: [
          {
            action: "update_settings",
            who: "qa-seed",
            when: FIXED_TIME.toISOString(),
            reason: "seed_settings_defaults",
            previous_version: 0,
            next_version: 1,
            change_summary: [
              {
                field: "default_trial_days",
                from: 0,
                to: 14,
              },
              {
                field: "dunning_retry_intervals",
                from: [1440, 4320, 10080],
                to: [60, 180, 720],
              },
              {
                field: "default_renewal_behavior",
                from: SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
                to:
                  SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
              },
              {
                field: "default_cancellation_behavior",
                from:
                  SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
                to: SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
              },
            ],
          },
        ],
        last_update: {
          action: "update_settings",
          who: "qa-seed",
          when: FIXED_TIME.toISOString(),
          reason: "seed_settings_defaults",
          previous_version: 0,
          next_version: 1,
          change_summary: [
            {
              field: "default_trial_days",
              from: 0,
              to: 14,
            },
            {
              field: "dunning_retry_intervals",
              from: [1440, 4320, 10080],
              to: [60, 180, 720],
            },
            {
              field: "default_renewal_behavior",
              from: SubscriptionRenewalBehavior.PROCESS_IMMEDIATELY,
              to:
                SubscriptionRenewalBehavior.REQUIRE_REVIEW_FOR_PENDING_CHANGES,
            },
            {
              field: "default_cancellation_behavior",
              from:
                SubscriptionCancellationBehavior.RECOMMEND_RETENTION_FIRST,
              to: SubscriptionCancellationBehavior.ALLOW_DIRECT_CANCELLATION,
            },
          ],
        },
      },
    })
  }

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
  const cancellationOpenBillingAt = addDays(FIXED_TIME, 7)
  const cancellationRetainedDiscountAt = addDays(FIXED_TIME, 8)
  const cancellationPausedAt = addDays(FIXED_TIME, 9)
  const cancellationCanceledImmediateAt = addDays(FIXED_TIME, 10)
  const cancellationCanceledEndCycleAt = addDays(FIXED_TIME, 12)
  const cancellationOpenPriceAt = addDays(FIXED_TIME, 13)
  const cancellationOpenPausedAt = addDays(FIXED_TIME, 14)

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subSuccess,
      reference: "SUB-QA-REN-SUCCESS",
      customer: getSeedCustomer(IDS.subSuccess),
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
      customer: getSeedCustomer(IDS.subPaused),
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
      customer: getSeedCustomer(IDS.subCancelEffective),
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
      customer: getSeedCustomer(IDS.subApprovalPending),
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
      customer: getSeedCustomer(IDS.subPolicyBlocked),
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
      customer: getSeedCustomer(IDS.subFailedHistory),
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
      customer: getSeedCustomer(IDS.subDunningRetryScheduled),
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
      id: IDS.subCancellationOpenBilling,
      reference: "SUB-QA-CAN-OPEN-BILLING",
      customer: getSeedCustomer(IDS.subCancellationOpenBilling),
      target: targets.success,
      status: SubscriptionStatus.PAST_DUE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancellationOpenBillingAt,
      skip_next_cycle: false,
      cart_id: "cart_seed_cancellation_open_billing",
      payment_provider_id: "pp_stripe_stripe",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationRetainedDiscount,
      reference: "SUB-QA-CAN-RETAINED-DISCOUNT",
      customer: getSeedCustomer(IDS.subCancellationRetainedDiscount),
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancellationRetainedDiscountAt,
      skip_next_cycle: false,
      cart_id: "cart_seed_cancellation_retained_discount",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationPaused,
      reference: "SUB-QA-CAN-PAUSED",
      customer: getSeedCustomer(IDS.subCancellationPaused),
      target: targets.success,
      status: SubscriptionStatus.PAUSED,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancellationPausedAt,
      skip_next_cycle: false,
      paused_at: addDays(FIXED_TIME, -2),
      cart_id: "cart_seed_cancellation_paused",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationCanceledImmediate,
      reference: "SUB-QA-CAN-CANCELED-IMMEDIATE",
      customer: getSeedCustomer(IDS.subCancellationCanceledImmediate),
      target: targets.blocked,
      status: SubscriptionStatus.CANCELLED,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: null,
      skip_next_cycle: false,
      cancelled_at: FIXED_TIME,
      cancel_effective_at: FIXED_TIME,
      cart_id: "cart_seed_cancellation_canceled_immediate",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationCanceledEndCycle,
      reference: "SUB-QA-CAN-CANCELED-END-CYCLE",
      customer: getSeedCustomer(IDS.subCancellationCanceledEndCycle),
      target: targets.blocked,
      status: SubscriptionStatus.CANCELLED,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: null,
      skip_next_cycle: false,
      cancelled_at: FIXED_TIME,
      cancel_effective_at: cancellationCanceledEndCycleAt,
      cart_id: "cart_seed_cancellation_canceled_end_cycle",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationOpenPrice,
      reference: "SUB-QA-CAN-OPEN-PRICE",
      customer: getSeedCustomer(IDS.subCancellationOpenPrice),
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancellationOpenPriceAt,
      skip_next_cycle: false,
      cart_id: "cart_seed_cancellation_open_price",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subCancellationOpenPaused,
      reference: "SUB-QA-CAN-OPEN-PAUSED-SUB",
      customer: getSeedCustomer(IDS.subCancellationOpenPaused),
      target: targets.success,
      status: SubscriptionStatus.PAUSED,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 1,
      next_renewal_at: cancellationOpenPausedAt,
      skip_next_cycle: false,
      paused_at: addDays(FIXED_TIME, -5),
      cart_id: "cart_seed_cancellation_open_paused",
    })
  )

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subDunningAwaitingManual,
      reference: "SUB-QA-DUN-AWAITING-MANUAL",
      customer: getSeedCustomer(IDS.subDunningAwaitingManual),
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
      customer: getSeedCustomer(IDS.subDunningRecovered),
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
      customer: getSeedCustomer(IDS.subDunningUnrecovered),
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
      customer: getSeedCustomer(IDS.subDunningManualOverride),
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

  await upsertSubscription(
    subscriptionModule,
    buildSubscriptionRecord({
      id: IDS.subAnalyticsBiMonthly,
      reference: "SUB-QA-ANL-BI-MONTHLY",
      customer: getSeedCustomer(IDS.subAnalyticsBiMonthly),
      target: targets.success,
      status: SubscriptionStatus.ACTIVE,
      frequency_interval: SubscriptionFrequencyInterval.MONTH,
      frequency_value: 2,
      next_renewal_at: addDays(FIXED_TIME, 18),
      skip_next_cycle: false,
      cart_id: "cart_seed_analytics_bimonthly",
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
    id: IDS.cycleCancellationOpenBilling,
    subscription_id: IDS.subCancellationOpenBilling,
    scheduled_for: cancellationOpenBillingAt,
    processed_at: addDays(FIXED_TIME, -1),
    status: RenewalCycleStatus.FAILED,
    approval_required: false,
    approval_status: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_reason: null,
    generated_order_id: "ord_seed_cancellation_open_billing",
    applied_pending_update_data: null,
    last_error: "Payment-qualified billing failure before retention handling.",
    attempt_count: 1,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-open-billing",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationRetainedDiscount,
    subscription_id: IDS.subCancellationRetainedDiscount,
    scheduled_for: cancellationRetainedDiscountAt,
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
      scenario: "cancellation-retained-discount",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationPaused,
    subscription_id: IDS.subCancellationPaused,
    scheduled_for: cancellationPausedAt,
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
      scenario: "cancellation-paused",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationCanceledImmediate,
    subscription_id: IDS.subCancellationCanceledImmediate,
    scheduled_for: cancellationCanceledImmediateAt,
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
      scenario: "cancellation-canceled-immediate",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationCanceledEndCycle,
    subscription_id: IDS.subCancellationCanceledEndCycle,
    scheduled_for: cancellationCanceledEndCycleAt,
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
      scenario: "cancellation-canceled-end-cycle",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationOpenPrice,
    subscription_id: IDS.subCancellationOpenPrice,
    scheduled_for: cancellationOpenPriceAt,
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
      scenario: "cancellation-open-price",
    },
  })

  await upsertRenewalCycle(renewalModule, {
    id: IDS.cycleCancellationOpenPaused,
    subscription_id: IDS.subCancellationOpenPaused,
    scheduled_for: cancellationOpenPausedAt,
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
      scenario: "cancellation-open-paused-sub",
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
    id: IDS.dunningCancellationOpenBilling,
    subscription_id: IDS.subCancellationOpenBilling,
    renewal_cycle_id: IDS.cycleCancellationOpenBilling,
    renewal_order_id: "ord_seed_cancellation_open_billing",
    status: DunningCaseStatus.RETRY_SCHEDULED,
    attempt_count: 1,
    max_attempts: 3,
    retry_schedule: buildRetrySchedule(),
    next_retry_at: addDays(FIXED_TIME, 1),
    last_payment_error_code: "card_declined",
    last_payment_error_message:
      "Billing issue is active while the operator evaluates retention.",
    last_attempt_at: FIXED_TIME,
    recovered_at: null,
    closed_at: null,
    recovery_reason: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-open-billing",
      qa_focus: ["cancellation-detail", "linked-dunning", "smart-cancel"],
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

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationOpenBilling,
    subscription_id: IDS.subCancellationOpenBilling,
    status: CancellationCaseStatus.EVALUATING_RETENTION,
    reason: "Customer reports billing problems and wants to stop unless billing is stabilized.",
    reason_category: CancellationReasonCategory.BILLING,
    notes: "Use to validate active case detail with linked dunning summary.",
    recommended_action: CancellationRecommendedAction.PAUSE_OFFER,
    final_outcome: null,
    finalized_at: null,
    finalized_by: null,
    cancellation_effective_at: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-open-billing",
      smart_cancellation: {
        recommended_action: CancellationRecommendedAction.PAUSE_OFFER,
        eligible_actions: [
          CancellationRecommendedAction.PAUSE_OFFER,
          CancellationRecommendedAction.DIRECT_CANCEL,
        ],
        rationale:
          "Billing issues with active dunning make pause safer than a new discount.",
        evaluated_by: "qa-seed",
        evaluated_at: FIXED_TIME.toISOString(),
      },
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationRetainedDiscount,
    subscription_id: IDS.subCancellationRetainedDiscount,
    status: CancellationCaseStatus.RETAINED,
    reason: "Customer said the current price is too high.",
    reason_category: CancellationReasonCategory.PRICE,
    notes: "Use to validate retained detail, timeline, and discount-offer filtering.",
    recommended_action: CancellationRecommendedAction.DISCOUNT_OFFER,
    final_outcome: CancellationFinalOutcome.RETAINED,
    finalized_at: FIXED_TIME,
    finalized_by: "qa-seed",
    cancellation_effective_at: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-retained-discount",
      manual_actions: [
        {
          action: "apply_offer",
          who: "qa-seed",
          when: FIXED_TIME.toISOString(),
          why: "Customer accepted a temporary discount.",
          data: {
            offer_type: "discount_offer",
          },
        },
      ],
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationPaused,
    subscription_id: IDS.subCancellationPaused,
    status: CancellationCaseStatus.PAUSED,
    reason: "Customer asked for a temporary pause instead of canceling.",
    reason_category: CancellationReasonCategory.TEMPORARY_PAUSE,
    notes: "Use to validate pause as retention outcome.",
    recommended_action: CancellationRecommendedAction.PAUSE_OFFER,
    final_outcome: CancellationFinalOutcome.PAUSED,
    finalized_at: addDays(FIXED_TIME, -2),
    finalized_by: "qa-seed",
    cancellation_effective_at: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-paused",
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationCanceledImmediate,
    subscription_id: IDS.subCancellationCanceledImmediate,
    status: CancellationCaseStatus.CANCELED,
    reason: "Customer switched to another provider and requested immediate cancel.",
    reason_category: CancellationReasonCategory.SWITCHED_COMPETITOR,
    notes: "Use to compare immediate cancel semantics on detail.",
    recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
    final_outcome: CancellationFinalOutcome.CANCELED,
    finalized_at: FIXED_TIME,
    finalized_by: "qa-seed",
    cancellation_effective_at: FIXED_TIME,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-canceled-immediate",
      final_cancellation: {
        effective_at: "immediately",
      },
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationCanceledEndCycle,
    subscription_id: IDS.subCancellationCanceledEndCycle,
    status: CancellationCaseStatus.CANCELED,
    reason: "Customer wants cancellation at the end of the current cycle.",
    reason_category: CancellationReasonCategory.OTHER,
    notes: "Use to compare end-of-cycle cancellation semantics.",
    recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
    final_outcome: CancellationFinalOutcome.CANCELED,
    finalized_at: FIXED_TIME,
    finalized_by: "qa-seed",
    cancellation_effective_at: cancellationCanceledEndCycleAt,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-canceled-end-cycle",
      final_cancellation: {
        effective_at: "end_of_cycle",
      },
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationOpenPrice,
    subscription_id: IDS.subCancellationOpenPrice,
    status: CancellationCaseStatus.REQUESTED,
    reason: "Customer is considering cancellation because the price feels too high.",
    reason_category: CancellationReasonCategory.PRICE,
    notes: "Use to run smart cancellation and test discount recommendation.",
    recommended_action: null,
    final_outcome: null,
    finalized_at: null,
    finalized_by: null,
    cancellation_effective_at: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-open-price",
    },
  })

  await upsertCancellationCase(cancellationModule, {
    id: IDS.cancellationOpenPaused,
    subscription_id: IDS.subCancellationOpenPaused,
    status: CancellationCaseStatus.REQUESTED,
    reason: "Paused customer may still want final cancellation after the break.",
    reason_category: CancellationReasonCategory.OTHER,
    notes: "Use to validate an active case on an already paused subscription.",
    recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
    final_outcome: null,
    finalized_at: null,
    finalized_by: null,
    cancellation_effective_at: null,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-open-paused-sub",
      smart_cancellation: {
        recommended_action: CancellationRecommendedAction.DIRECT_CANCEL,
        eligible_actions: [CancellationRecommendedAction.DIRECT_CANCEL],
        rationale:
          "Subscription is already paused, so direct cancellation is the main remaining operator path.",
        evaluated_by: "qa-seed",
        evaluated_at: FIXED_TIME.toISOString(),
      },
    },
  })

  await upsertRetentionOfferEvent(cancellationModule, {
    id: IDS.retentionDiscountRetained,
    cancellation_case_id: IDS.cancellationRetainedDiscount,
    offer_type: RetentionOfferType.DISCOUNT_OFFER,
    offer_payload: {
      discount_offer: {
        discount_type: "percentage",
        discount_value: 15,
        duration_cycles: 2,
        note: "QA seed retention discount",
      },
    },
    decision_status: RetentionOfferDecisionStatus.APPLIED,
    decision_reason: "Customer accepted a temporary 15% retention discount.",
    decided_at: FIXED_TIME,
    decided_by: "qa-seed",
    applied_at: FIXED_TIME,
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-retained-discount",
    },
  })

  await upsertRetentionOfferEvent(cancellationModule, {
    id: IDS.retentionPauseApplied,
    cancellation_case_id: IDS.cancellationPaused,
    offer_type: RetentionOfferType.PAUSE_OFFER,
    offer_payload: {
      pause_offer: {
        pause_cycles: 2,
        resume_at: null,
        note: "QA seed pause offer",
      },
    },
    decision_status: RetentionOfferDecisionStatus.APPLIED,
    decision_reason: "Customer accepted a two-cycle pause.",
    decided_at: addDays(FIXED_TIME, -2),
    decided_by: "qa-seed",
    applied_at: addDays(FIXED_TIME, -2),
    metadata: {
      seed_namespace: "subscriptions-test-data",
      scenario: "cancellation-paused",
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

  await upsertSubscriptionLog(activityLogModule, {
    id: IDS.logSubscriptionPaused,
    subscription_id: IDS.subPaused,
    customer_id: getSeedCustomer(IDS.subPaused).id,
    event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
    actor_type: ActivityLogActorType.USER,
    actor_id: "qa-seed-admin",
    subscription_reference: "SUB-QA-REN-PAUSED",
    customer_name: "QA SUB-QA-REN-PAUSED",
    product_title: targets.success.product_title,
    variant_title: targets.success.variant_title,
    reason: "Seeded admin pause event for timeline and detail verification.",
    dedupe_key: "seed:activity-log:subscription-paused",
    previous_state: {
      status: "active",
      paused_at: null,
    },
    new_state: {
      status: "paused",
      paused_at: addDays(FIXED_TIME, -1).toISOString(),
    },
    changed_fields: [
      {
        field: "status",
        before: "active",
        after: "paused",
      },
      {
        field: "paused_at",
        before: null,
        after: addDays(FIXED_TIME, -1).toISOString(),
      },
    ],
    metadata: {
      source: "seed-script",
      seed_namespace: "subscriptions-test-data",
    },
  })

  await upsertSubscriptionLog(activityLogModule, {
    id: IDS.logRenewalSucceeded,
    subscription_id: IDS.subSuccess,
    customer_id: getSeedCustomer(IDS.subSuccess).id,
    event_type: ActivityLogEventType.RENEWAL_SUCCEEDED,
    actor_type: ActivityLogActorType.SCHEDULER,
    actor_id: null,
    subscription_reference: "SUB-QA-REN-SUCCESS",
    customer_name: "QA SUB-QA-REN-SUCCESS",
    product_title: targets.success.product_title,
    variant_title: targets.success.variant_title,
    reason: null,
    dedupe_key: "seed:activity-log:renewal-succeeded",
    previous_state: {
      status: "scheduled",
      processed_at: null,
    },
    new_state: {
      status: "succeeded",
      processed_at: FIXED_TIME.toISOString(),
    },
    changed_fields: [
      {
        field: "status",
        before: "scheduled",
        after: "succeeded",
      },
      {
        field: "processed_at",
        before: null,
        after: FIXED_TIME.toISOString(),
      },
    ],
    metadata: {
      source: "seed-script",
      seed_namespace: "subscriptions-test-data",
      renewal_cycle_id: IDS.cycleSuccess,
      scheduled_for: successScheduledFor.toISOString(),
    },
  })

  await upsertSubscriptionLog(activityLogModule, {
    id: IDS.logDunningRecovered,
    subscription_id: IDS.subDunningRecovered,
    customer_id: getSeedCustomer(IDS.subDunningRecovered).id,
    event_type: ActivityLogEventType.DUNNING_RECOVERED,
    actor_type: ActivityLogActorType.SYSTEM,
    actor_id: "qa-seed-system",
    subscription_reference: "SUB-QA-DUN-RECOVERED",
    customer_name: "QA SUB-QA-DUN-RECOVERED",
    product_title: targets.success.product_title,
    variant_title: targets.success.variant_title,
    reason: "Seeded recovery event to validate system-originated activity-log rows.",
    dedupe_key: "seed:activity-log:dunning-recovered",
    previous_state: {
      status: "retry_scheduled",
      attempt_count: 1,
    },
    new_state: {
      status: "recovered",
      attempt_count: 2,
    },
    changed_fields: [
      {
        field: "status",
        before: "retry_scheduled",
        after: "recovered",
      },
      {
        field: "attempt_count",
        before: 1,
        after: 2,
      },
    ],
    metadata: {
      source: "seed-script",
      seed_namespace: "subscriptions-test-data",
      dunning_case_id: IDS.dunningRecovered,
      reason_code: "automatic_retry_succeeded",
    },
  })

  const analyticsDates = [
    "2026-04-06",
    "2026-04-07",
    "2026-04-08",
    "2026-04-09",
    "2026-04-10",
    "2026-04-11",
    "2026-04-12",
    "2026-04-13",
    "2026-04-14",
    "2026-04-15",
  ]

  for (const date of analyticsDates) {
    const successMrr = date === "2026-04-12" ? 260 : 120

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subSuccess,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subSuccess).id,
        product_id: targets.success.product_id,
        variant_id: targets.success.variant_id,
        status: SubscriptionStatus.ACTIVE,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 1,
        currency_code: "USD",
        active_subscriptions_count: 1,
        mrr_amount: successMrr,
        churned_subscriptions_count: 0,
        churn_reason_category: null,
        scenario: "analytics-active-monthly-baseline",
      })
    )

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subAnalyticsBiMonthly,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subAnalyticsBiMonthly).id,
        product_id: targets.success.product_id,
        variant_id: targets.success.variant_id,
        status: SubscriptionStatus.ACTIVE,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 2,
        currency_code: "USD",
        active_subscriptions_count: 1,
        mrr_amount: 45,
        churned_subscriptions_count: 0,
        churn_reason_category: null,
        scenario: "analytics-active-bimonthly-comparison",
      })
    )

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subPaused,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subPaused).id,
        product_id: targets.success.product_id,
        variant_id: targets.success.variant_id,
        status: SubscriptionStatus.PAUSED,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 1,
        currency_code: null,
        active_subscriptions_count: 0,
        mrr_amount: null,
        churned_subscriptions_count: 0,
        churn_reason_category: null,
        scenario: "analytics-status-segmentation-paused",
      })
    )

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subDunningRetryScheduled,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subDunningRetryScheduled).id,
        product_id: targets.success.product_id,
        variant_id: targets.success.variant_id,
        status: SubscriptionStatus.PAST_DUE,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 1,
        currency_code: null,
        active_subscriptions_count: 0,
        mrr_amount: null,
        churned_subscriptions_count: 0,
        churn_reason_category: null,
        scenario: "analytics-status-segmentation-past-due",
      })
    )

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subCancellationCanceledImmediate,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subCancellationCanceledImmediate).id,
        product_id: targets.blocked.product_id,
        variant_id: targets.blocked.variant_id,
        status: SubscriptionStatus.CANCELLED,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 1,
        currency_code: null,
        active_subscriptions_count: 0,
        mrr_amount: null,
        churned_subscriptions_count: date === "2026-04-10" ? 1 : 0,
        churn_reason_category:
          date === "2026-04-10" ? CancellationReasonCategory.BILLING : null,
        scenario: "analytics-churn-billing",
      })
    )

    await upsertSubscriptionMetricsDaily(
      analyticsModule,
      buildAnalyticsSnapshotRecord({
        subscription_id: IDS.subCancellationCanceledEndCycle,
        metric_date: date,
        customer_id: getSeedCustomer(IDS.subCancellationCanceledEndCycle).id,
        product_id: targets.blocked.product_id,
        variant_id: targets.blocked.variant_id,
        status: SubscriptionStatus.CANCELLED,
        frequency_interval: SubscriptionFrequencyInterval.MONTH,
        frequency_value: 1,
        currency_code: null,
        active_subscriptions_count: 0,
        mrr_amount: null,
        churned_subscriptions_count: date === "2026-04-14" ? 1 : 0,
        churn_reason_category:
          date === "2026-04-14" ? CancellationReasonCategory.PRICE : null,
        scenario: "analytics-churn-price",
      })
    )
  }

  const summary: SeedSummaryRow[] = [
    ...(shouldSeedSettings
      ? [
          {
            scenario: "Settings global defaults",
            subscription_reference: "GLOBAL",
            notes:
              "Use Settings > Subscription Settings to inspect a persisted singleton with trial_days=14, retry intervals [60,180,720], renewal review-by-default, and direct-cancel default.",
          } satisfies SeedSummaryRow,
        ]
      : []),
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
    {
      scenario: "Cancellation open case with linked dunning",
      subscription_reference: "SUB-QA-CAN-OPEN-BILLING",
      renewal_cycle_id: IDS.cycleCancellationOpenBilling,
      dunning_case_id: IDS.dunningCancellationOpenBilling,
      cancellation_case_id: IDS.cancellationOpenBilling,
      notes:
        "Use on Subscriptions > Cancellation & Retention to inspect an active case with billing reason, linked dunning summary, and pause-oriented recommendation.",
    },
    {
      scenario: "Cancellation retained after discount offer",
      subscription_reference: "SUB-QA-CAN-RETAINED-DISCOUNT",
      renewal_cycle_id: IDS.cycleCancellationRetainedDiscount,
      cancellation_case_id: IDS.cancellationRetainedDiscount,
      notes:
        "Use to validate retained detail, offer history, final timeline, and filters by outcome and discount offer type.",
    },
    {
      scenario: "Cancellation paused after pause offer",
      subscription_reference: "SUB-QA-CAN-PAUSED",
      renewal_cycle_id: IDS.cycleCancellationPaused,
      cancellation_case_id: IDS.cancellationPaused,
      notes:
        "Use to validate pause as a retention outcome and compare subscription paused state with case final outcome.",
    },
    {
      scenario: "Cancellation finalized immediately",
      subscription_reference: "SUB-QA-CAN-CANCELED-IMMEDIATE",
      renewal_cycle_id: IDS.cycleCancellationCanceledImmediate,
      cancellation_case_id: IDS.cancellationCanceledImmediate,
      notes:
        "Use to inspect immediate final cancel, cancel_effective_at, and cleared renewal eligibility semantics.",
    },
    {
      scenario: "Cancellation finalized at end of cycle",
      subscription_reference: "SUB-QA-CAN-CANCELED-END-CYCLE",
      renewal_cycle_id: IDS.cycleCancellationCanceledEndCycle,
      cancellation_case_id: IDS.cancellationCanceledEndCycle,
      notes:
        "Use to compare end-of-cycle final cancel against immediate cancel on the detail page.",
    },
    {
      scenario: "Cancellation open case with price reason",
      subscription_reference: "SUB-QA-CAN-OPEN-PRICE",
      renewal_cycle_id: IDS.cycleCancellationOpenPrice,
      cancellation_case_id: IDS.cancellationOpenPrice,
      notes:
        "Use to run smart cancellation and validate a discount-oriented recommendation path without active dunning.",
    },
    {
      scenario: "Cancellation open case for paused subscription",
      subscription_reference: "SUB-QA-CAN-OPEN-PAUSED-SUB",
      renewal_cycle_id: IDS.cycleCancellationOpenPaused,
      cancellation_case_id: IDS.cancellationOpenPaused,
      notes:
        "Use to validate cancellation detail and decision-making when the subscription is already paused.",
    },
    {
      scenario: "Activity Log: admin subscription pause",
      subscription_reference: "SUB-QA-REN-PAUSED",
      notes:
        "Use on global Activity Log and subscription timeline to verify a user-triggered subscription event with before/after state.",
    },
    {
      scenario: "Activity Log: scheduler renewal success",
      subscription_reference: "SUB-QA-REN-SUCCESS",
      renewal_cycle_id: IDS.cycleSuccess,
      notes:
        "Use to verify scheduler actor rendering and a compact renewal success payload in list, detail, and timeline.",
    },
    {
      scenario: "Activity Log: system dunning recovery",
      subscription_reference: "SUB-QA-DUN-RECOVERED",
      renewal_cycle_id: IDS.cycleDunningRecovered,
      dunning_case_id: IDS.dunningRecovered,
      notes:
        "Use to verify system-originated actor rendering and cross-domain dunning recovery context in the Activity Log.",
    },
    {
      scenario: "Analytics overview baseline",
      subscription_reference: "SUB-QA-REN-SUCCESS",
      notes:
        "Use on Subscriptions > Analytics for 2026-04-06..2026-04-15. Baseline active monthly MRR plus one intentional spike on 2026-04-12.",
    },
    {
      scenario: "Analytics frequency comparison",
      subscription_reference: "SUB-QA-ANL-BI-MONTHLY",
      notes:
        "Use frequency filter month:2 to isolate a dedicated bi-monthly active subscription with deterministic USD contribution.",
    },
    {
      scenario: "Analytics churn windows",
      subscription_reference: "SUB-QA-CAN-CANCELED-IMMEDIATE",
      cancellation_case_id: IDS.cancellationCanceledImmediate,
      notes:
        "Use Analytics for 2026-04-10 and 2026-04-14 to inspect churn spikes and exports with billing vs price churn days.",
    },
  ]

  logger.info("[subscriptions-test-data] Seed completed.")
  logger.info(
    `[subscriptions-test-data] Scenario summary:\n${formatSummary(summary)}`
  )
}
