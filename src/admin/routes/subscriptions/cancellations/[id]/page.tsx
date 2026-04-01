import {
  Alert,
  Button,
  Container,
  Drawer,
  DropdownMenu,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import {
  CheckCircle,
  EllipsisHorizontal,
  PencilSquare,
  Spinner,
  TriangleRightMini,
  XCircle,
} from "@medusajs/icons"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ReactNode, useEffect, useMemo, useState } from "react"
import { Link, UIMatch, useParams } from "react-router-dom"
import { sdk } from "../../../../lib/client"
import {
  invalidateAdminCancellationQueries,
  useAdminCancellationActionFormQuery,
  useAdminCancellationDetailQuery,
} from "../data-loading"
import {
  CancellationCaseAdminStatus,
  CancellationFinalOutcomeAdmin,
  CancellationRecommendedActionAdmin,
} from "../../../../types/cancellation"
import type {
  ApplyRetentionOfferAdminRequest,
  CancellationAdminOfferEventRecord,
  CancellationCaseAdminDetail,
  CancellationCaseAdminDetailResponse,
  FinalizeCancellationAdminRequest,
  SmartCancellationAdminRequest,
  UpdateCancellationReasonAdminRequest,
} from "../../../../types/cancellation"

type ActionDrawerMode = "apply_offer" | "finalize" | "reason"
type OfferType = "pause_offer" | "discount_offer" | "bonus_offer"
type ReasonCategory =
  | "price"
  | "product_fit"
  | "delivery"
  | "billing"
  | "temporary_pause"
  | "switched_competitor"
  | "other"

const terminalStatuses = new Set<CancellationCaseAdminStatus>([
  CancellationCaseAdminStatus.RETAINED,
  CancellationCaseAdminStatus.PAUSED,
  CancellationCaseAdminStatus.CANCELED,
])

const reasonCategoryOptions: Array<{ label: string; value: ReasonCategory }> = [
  { label: "Price", value: "price" },
  { label: "Product fit", value: "product_fit" },
  { label: "Delivery", value: "delivery" },
  { label: "Billing", value: "billing" },
  { label: "Temporary pause", value: "temporary_pause" },
  { label: "Switched competitor", value: "switched_competitor" },
  { label: "Other", value: "other" },
]

const offerTypeOptions: Array<{ label: string; value: OfferType }> = [
  { label: "Pause offer", value: "pause_offer" },
  { label: "Discount offer", value: "discount_offer" },
  { label: "Bonus offer", value: "bonus_offer" },
]

const effectiveAtOptions = [
  { label: "Immediately", value: "immediately" },
  { label: "End of cycle", value: "end_of_cycle" },
] as const

const discountTypeOptions = [
  { label: "Percentage", value: "percentage" },
  { label: "Fixed", value: "fixed" },
] as const

const bonusTypeOptions = [
  { label: "Free cycle", value: "free_cycle" },
  { label: "Gift", value: "gift" },
  { label: "Credit", value: "credit" },
] as const

const CancellationDetailPage = () => {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false)
  const [actionDrawerMode, setActionDrawerMode] =
    useState<ActionDrawerMode>("apply_offer")
  const [formError, setFormError] = useState<string | null>(null)

  const [offerType, setOfferType] = useState<OfferType>("pause_offer")
  const [decisionReason, setDecisionReason] = useState("")
  const [pauseCycles, setPauseCycles] = useState("2")
  const [resumeAt, setResumeAt] = useState("")
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    "percentage"
  )
  const [discountValue, setDiscountValue] = useState("10")
  const [discountDurationCycles, setDiscountDurationCycles] = useState("2")
  const [bonusType, setBonusType] = useState<"free_cycle" | "gift" | "credit">(
    "free_cycle"
  )
  const [bonusValue, setBonusValue] = useState("1")
  const [bonusLabel, setBonusLabel] = useState("")
  const [bonusDurationCycles, setBonusDurationCycles] = useState("1")
  const [offerNote, setOfferNote] = useState("")

  const [reason, setReason] = useState("")
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory | "">("")
  const [notes, setNotes] = useState("")
  const [updateReasonExplanation, setUpdateReasonExplanation] = useState("")
  const [effectiveAt, setEffectiveAt] = useState<"immediately" | "end_of_cycle">(
    "immediately"
  )

  const { data, isLoading, isError, error } = useAdminCancellationDetailQuery(id)
  const cancellation = data?.cancellation
  const { data: actionFormData } = useAdminCancellationActionFormQuery(
    id,
    actionDrawerOpen,
    data
  )
  const actionFormCancellation = actionFormData?.cancellation ?? cancellation

  const smartCancelMutation = useMutation({
    mutationFn: async (body: SmartCancellationAdminRequest) =>
      sdk.client.fetch<CancellationCaseAdminDetailResponse>(
        `/admin/cancellations/${id}/smart-cancel`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminCancellationQueries(queryClient, id)
      toast.success("Recommendation updated")
    },
    onError: (mutationError) => {
      toast.error(getAdminErrorMessage(mutationError, "Failed to run smart cancellation"))
    },
  })

  const applyOfferMutation = useMutation({
    mutationFn: async (body: ApplyRetentionOfferAdminRequest) =>
      sdk.client.fetch<CancellationCaseAdminDetailResponse>(
        `/admin/cancellations/${id}/apply-offer`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminCancellationQueries(queryClient, id)
      toast.success("Retention offer applied")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to apply retention offer"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: async (body: FinalizeCancellationAdminRequest) =>
      sdk.client.fetch<CancellationCaseAdminDetailResponse>(
        `/admin/cancellations/${id}/finalize`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminCancellationQueries(queryClient, id)
      toast.success("Cancellation finalized")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to finalize cancellation"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const updateReasonMutation = useMutation({
    mutationFn: async (body: UpdateCancellationReasonAdminRequest) =>
      sdk.client.fetch<CancellationCaseAdminDetailResponse>(
        `/admin/cancellations/${id}/reason`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminCancellationQueries(queryClient, id)
      toast.success("Reason updated")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to update reason"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const metadataRows = useMemo(() => {
    if (!cancellation?.metadata) {
      return []
    }

    return Object.entries(cancellation.metadata).map(([key, value]) => ({
      key,
      value:
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }))
  }, [cancellation])

  const smartCancellationSnapshot = useMemo(() => {
    const value = cancellation?.metadata?.smart_cancellation

    if (!value || typeof value !== "object") {
      return null
    }

    return value as Record<string, unknown>
  }, [cancellation])

  const canRunSmartCancellation = cancellation
    ? !terminalStatuses.has(cancellation.status)
    : false
  const canApplyOffer = canRunSmartCancellation
  const canFinalize = canRunSmartCancellation
  const canEditReason = canRunSmartCancellation
  const isActionPending =
    smartCancelMutation.isPending ||
    applyOfferMutation.isPending ||
    finalizeMutation.isPending ||
    updateReasonMutation.isPending

  const timelineItems = useMemo(() => {
    if (!cancellation) {
      return []
    }

    const items: Array<{
      id: string
      title: string
      date: string | null
      status: string
      color: "grey" | "blue" | "orange" | "green" | "red"
      description: string
    }> = cancellation.offers.map((offer) => ({
      id: offer.id,
      title: formatOfferType(offer.offer_type),
      date: offer.applied_at ?? offer.decided_at ?? offer.created_at,
      status: formatOfferDecisionStatus(offer.decision_status),
      color: getOfferDecisionColor(offer.decision_status),
      description:
        offer.decision_reason ||
        describeOfferPayload(offer) ||
        "Retention offer event recorded",
    }))

    if (cancellation.final_outcome) {
      items.push({
        id: `${cancellation.id}-final-outcome`,
        title: "Final outcome",
        date: cancellation.finalized_at,
        status: formatFinalOutcome(cancellation.final_outcome),
        color: getFinalOutcomeColor(cancellation.final_outcome),
        description:
          cancellation.cancellation_effective_at &&
          cancellation.final_outcome === CancellationFinalOutcomeAdmin.CANCELED
            ? `Effective at ${formatDateTime(cancellation.cancellation_effective_at)}`
            : cancellation.notes || "Case reached a terminal outcome",
      })
    }

    return items.sort((left, right) => {
      const leftValue = left.date ? new Date(left.date).getTime() : 0
      const rightValue = right.date ? new Date(right.date).getTime() : 0
      return leftValue - rightValue
    })
  }, [cancellation])

  useEffect(() => {
    if (!actionDrawerOpen || !actionFormCancellation) {
      return
    }

    setFormError(null)

    if (actionDrawerMode === "apply_offer") {
      const recommendedAction =
        actionFormCancellation.recommended_action ===
        CancellationRecommendedActionAdmin.BONUS_OFFER
          ? "bonus_offer"
          : actionFormCancellation.recommended_action ===
                CancellationRecommendedActionAdmin.DISCOUNT_OFFER
            ? "discount_offer"
            : "pause_offer"

      setOfferType(recommendedAction)
      setDecisionReason("")
      setPauseCycles("2")
      setResumeAt("")
      setDiscountType("percentage")
      setDiscountValue("10")
      setDiscountDurationCycles("2")
      setBonusType("free_cycle")
      setBonusValue("1")
      setBonusLabel("")
      setBonusDurationCycles("1")
      setOfferNote("")
    }

    if (actionDrawerMode === "finalize") {
      setReason(actionFormCancellation.reason || "")
      setReasonCategory(
        (actionFormCancellation.reason_category as ReasonCategory | null) || ""
      )
      setNotes(actionFormCancellation.notes || "")
      setEffectiveAt("immediately")
    }

    if (actionDrawerMode === "reason") {
      setReason(actionFormCancellation.reason || "")
      setReasonCategory(
        (actionFormCancellation.reason_category as ReasonCategory | null) || ""
      )
      setNotes(actionFormCancellation.notes || "")
      setUpdateReasonExplanation("")
    }
  }, [actionDrawerMode, actionDrawerOpen, actionFormCancellation])

  const openDrawer = (mode: ActionDrawerMode) => {
    setActionDrawerMode(mode)
    setActionDrawerOpen(true)
  }

  const closeDrawer = () => {
    setActionDrawerOpen(false)
    setFormError(null)
  }

  const handleRunSmartCancellation = async () => {
    const confirmed = await prompt({
      title: "Run smart cancellation?",
      description:
        "You are about to evaluate the current cancellation case and refresh its recommendation.",
      confirmText: "Run evaluation",
      cancelText: "Cancel",
    })

    if (!confirmed) {
      return
    }

    await smartCancelMutation.mutateAsync({})
  }

  const handleSubmitDrawer = async () => {
    if (actionDrawerMode === "reason") {
      const normalizedReason = normalizeRequiredString(reason)

      if (!normalizedReason) {
        setFormError("Reason is required")
        toast.error("Reason is required")
        return
      }

      await updateReasonMutation.mutateAsync({
        reason: normalizedReason,
        reason_category: (reasonCategory || undefined) as ReasonCategory | undefined,
        notes: normalizeOptionalString(notes) ?? undefined,
        update_reason: normalizeOptionalString(updateReasonExplanation) ?? undefined,
      })
      return
    }

    if (actionDrawerMode === "apply_offer") {
      const normalizedDecisionReason = normalizeOptionalString(decisionReason)

      if (offerType === "pause_offer") {
        const normalizedPauseCycles = parseNullablePositiveInt(pauseCycles)
        const normalizedResumeAt = normalizeOptionalString(resumeAt)

        if (normalizedPauseCycles === null && !normalizedResumeAt) {
          setFormError("Pause offer requires pause cycles or resume date")
          toast.error("Pause offer requires pause cycles or resume date")
          return
        }

        await applyOfferMutation.mutateAsync({
          offer_type: "pause_offer",
          offer_payload: {
            pause_offer: {
              pause_cycles: normalizedPauseCycles,
              resume_at: normalizedResumeAt
                ? new Date(normalizedResumeAt).toISOString()
                : null,
              note: normalizeOptionalString(offerNote),
            },
          },
          decision_reason: normalizedDecisionReason ?? undefined,
        })
        return
      }

      if (offerType === "discount_offer") {
        const normalizedDiscountValue = parsePositiveNumber(discountValue)
        const normalizedDurationCycles =
          parseNullablePositiveInt(discountDurationCycles)

        if (!normalizedDiscountValue) {
          setFormError("Discount value must be greater than 0")
          toast.error("Discount value must be greater than 0")
          return
        }

        await applyOfferMutation.mutateAsync({
          offer_type: "discount_offer",
          offer_payload: {
            discount_offer: {
              discount_type: discountType,
              discount_value: normalizedDiscountValue,
              duration_cycles: normalizedDurationCycles,
              note: normalizeOptionalString(offerNote),
            },
          },
          decision_reason: normalizedDecisionReason ?? undefined,
        })
        return
      }

      const normalizedBonusValue = parseNullableNonNegativeNumber(bonusValue)
      const normalizedBonusDuration =
        parseNullablePositiveInt(bonusDurationCycles)

      if (
        (bonusType === "free_cycle" || bonusType === "credit") &&
        normalizedBonusValue === null
      ) {
        setFormError("Bonus value is required for free cycle or credit")
        toast.error("Bonus value is required for free cycle or credit")
        return
      }

      await applyOfferMutation.mutateAsync({
        offer_type: "bonus_offer",
        offer_payload: {
          bonus_offer: {
            bonus_type: bonusType,
            value: normalizedBonusValue,
            label: normalizeOptionalString(bonusLabel),
            duration_cycles: normalizedBonusDuration,
            note: normalizeOptionalString(offerNote),
          },
        },
        decision_reason: normalizedDecisionReason ?? undefined,
      })
      return
    }

    const normalizedReason = normalizeRequiredString(reason)

    if (!normalizedReason) {
      setFormError("Reason is required")
      toast.error("Reason is required")
      return
    }

    const confirmed = await prompt({
      title: "Finalize cancellation?",
      description:
        "You are about to finalize this case as canceled and update the subscription lifecycle.",
      confirmText: "Finalize cancellation",
      cancelText: "Cancel",
    })

    if (!confirmed) {
      return
    }

    await finalizeMutation.mutateAsync({
      reason: normalizedReason,
      reason_category: (reasonCategory || undefined) as ReasonCategory | undefined,
      notes: normalizeOptionalString(notes) ?? undefined,
      effective_at: effectiveAt,
    })
  }

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Cancellation case</Heading>
        </div>
        <div className="flex items-center gap-x-2 px-6 py-6 text-ui-fg-subtle">
          <Spinner className="animate-spin" />
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Loading cancellation case details...
          </Text>
        </div>
      </Container>
    )
  }

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Cancellation case</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error
              ? error.message
              : "Failed to load cancellation case details."}
          </Alert>
        </div>
      </Container>
    )
  }

  if (!cancellation) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Cancellation case</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="warning">Cancellation case details are unavailable.</Alert>
        </div>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Cancellation case
            </Text>
            <Heading level="h1">{cancellation.id}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Review cancellation context, retention actions, linked module summaries,
              and final outcome.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <StatusBadge color={getCaseStatusColor(cancellation.status)}>
              {formatCaseStatus(cancellation.status)}
            </StatusBadge>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton size="small" variant="transparent" disabled={isActionPending}>
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {canRunSmartCancellation ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => {
                      void handleRunSmartCancellation()
                    }}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>
                      {smartCancelMutation.isPending
                        ? "Running recommendation..."
                        : "Run smart cancellation"}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
                {canApplyOffer ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDrawer("apply_offer")}
                  >
                    <CheckCircle className="text-ui-fg-subtle" />
                    <span>Apply retention offer</span>
                  </DropdownMenu.Item>
                ) : null}
                {canEditReason ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDrawer("reason")}
                  >
                    <PencilSquare className="text-ui-fg-subtle" />
                    <span>Edit reason</span>
                  </DropdownMenu.Item>
                ) : null}
                {canFinalize ? (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      className="flex items-center gap-x-2"
                      disabled={isActionPending}
                      onClick={() => openDrawer("finalize")}
                    >
                      <XCircle className="text-ui-fg-subtle" />
                      <span>Finalize cancellation</span>
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
          <DetailBlock
            title="Case overview"
            rows={[
              {
                label: "Status",
                value: (
                  <StatusBadge color={getCaseStatusColor(cancellation.status)}>
                    {formatCaseStatus(cancellation.status)}
                  </StatusBadge>
                ),
              },
              {
                label: "Outcome",
                value: cancellation.final_outcome
                  ? formatFinalOutcome(cancellation.final_outcome)
                  : "No final outcome yet",
              },
              {
                label: "Reason category",
                value: formatReasonCategory(cancellation.reason_category),
              },
              { label: "Reason", value: cancellation.reason || "No reason recorded" },
              {
                label: "Recommended action",
                value: formatRecommendedAction(cancellation.recommended_action),
              },
              {
                label: "Finalized by",
                value: cancellation.finalized_by || "-",
              },
              {
                label: "Finalized at",
                value: formatDateTime(cancellation.finalized_at),
              },
              {
                label: "Cancellation effective at",
                value: formatDateTime(cancellation.cancellation_effective_at),
              },
            ]}
          />
          <DetailBlock
            title="Subscription summary"
            rows={[
              {
                label: "Reference",
                value: (
                  <Link
                    to={`/subscriptions/${cancellation.subscription.subscription_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    {cancellation.subscription.reference}
                  </Link>
                ),
              },
              {
                label: "Status",
                value: formatSubscriptionStatus(cancellation.subscription.status),
              },
              { label: "Customer", value: cancellation.subscription.customer_name },
              { label: "Product", value: cancellation.subscription.product_title },
              { label: "Variant", value: cancellation.subscription.variant_title },
              { label: "SKU", value: cancellation.subscription.sku || "-" },
              {
                label: "Next renewal",
                value: formatDateTime(cancellation.subscription.next_renewal_at),
              },
              {
                label: "Cancelled at",
                value: formatDateTime(cancellation.subscription.cancelled_at),
              },
            ]}
          />
          <DetailBlock
            title="Linked dunning summary"
            rows={
              cancellation.dunning
                ? [
                    {
                      label: "Dunning case",
                      value: (
                        <Link
                          to={`/subscriptions/dunning/${cancellation.dunning.dunning_case_id}`}
                          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                        >
                          {cancellation.dunning.dunning_case_id}
                        </Link>
                      ),
                    },
                    {
                      label: "Status",
                      value: formatDunningStatus(cancellation.dunning.status),
                    },
                    {
                      label: "Attempt count",
                      value: cancellation.dunning.attempt_count.toString(),
                    },
                    {
                      label: "Next retry",
                      value: formatDateTime(cancellation.dunning.next_retry_at),
                    },
                    {
                      label: "Last error",
                      value: cancellation.dunning.last_payment_error_message || "-",
                    },
                  ]
                : [{ label: "Summary", value: "No active dunning case linked" }]
            }
          />
          <DetailBlock
            title="Linked renewal summary"
            rows={
              cancellation.renewal
                ? [
                    {
                      label: "Renewal cycle",
                      value: (
                        <Link
                          to={`/subscriptions/renewals/${cancellation.renewal.renewal_cycle_id}`}
                          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                        >
                          {cancellation.renewal.renewal_cycle_id}
                        </Link>
                      ),
                    },
                    {
                      label: "Status",
                      value: formatRenewalStatus(cancellation.renewal.status),
                    },
                    {
                      label: "Scheduled for",
                      value: formatDateTime(cancellation.renewal.scheduled_for),
                    },
                    {
                      label: "Approval",
                      value: cancellation.renewal.approval_status
                        ? formatApprovalStatus(cancellation.renewal.approval_status)
                        : "-",
                    },
                    {
                      label: "Generated order",
                      value: cancellation.renewal.generated_order_id || "-",
                    },
                  ]
                : [{ label: "Summary", value: "No linked renewal cycle" }]
            }
          />
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Smart cancellation</Heading>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-start">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailRow
              label="Current recommendation"
              value={formatRecommendedAction(cancellation.recommended_action)}
            />
            <DetailRow
              label="Eligible actions"
              value={formatEligibleActions(smartCancellationSnapshot?.eligible_actions)}
            />
            <DetailRow
              label="Rationale"
              value={
                typeof smartCancellationSnapshot?.rationale === "string"
                  ? smartCancellationSnapshot.rationale
                  : "No smart-cancellation rationale recorded yet."
              }
            />
            <DetailRow
              label="Evaluated at"
              value={formatDateTime(
                typeof smartCancellationSnapshot?.evaluated_at === "string"
                  ? smartCancellationSnapshot.evaluated_at
                  : null
              )}
            />
          </div>
          <div className="flex justify-start md:justify-end">
            <Button
              size="small"
              type="button"
              onClick={() => {
                void handleRunSmartCancellation()
              }}
              isLoading={smartCancelMutation.isPending}
              disabled={!canRunSmartCancellation || isActionPending}
            >
              Run smart cancellation
            </Button>
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Decision timeline</Heading>
        </div>
        <div className="px-6 py-4">
          {timelineItems.length ? (
            <div className="flex flex-col gap-y-3">
              {timelineItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-ui-border-base p-4"
                >
                  <div className="flex flex-col gap-y-2 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-col gap-y-1">
                      <Text size="small" leading="compact" weight="plus">
                        {item.title}
                      </Text>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        {item.description}
                      </Text>
                    </div>
                    <div className="flex flex-col items-start gap-y-2 md:items-end">
                      <StatusBadge color={item.color}>{item.status}</StatusBadge>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        {formatDateTime(item.date)}
                      </Text>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No retention offers or final outcome entries have been recorded yet.
            </Text>
          )}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Offer history</Heading>
        </div>
        <div className="px-6 py-4">
          {cancellation.offers.length ? (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Offer</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Decided</Table.HeaderCell>
                  <Table.HeaderCell>Applied</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {cancellation.offers.map((offer) => (
                  <Table.Row key={offer.id}>
                    <Table.Cell>
                      <div className="flex flex-col gap-y-1">
                        <Text size="small" leading="compact" weight="plus">
                          {formatOfferType(offer.offer_type)}
                        </Text>
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          {describeOfferPayload(offer) || "No payload summary"}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={getOfferDecisionColor(offer.decision_status)}>
                        {formatOfferDecisionStatus(offer.decision_status)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{formatDateTime(offer.decided_at)}</Table.Cell>
                    <Table.Cell>{formatDateTime(offer.applied_at)}</Table.Cell>
                    <Table.Cell>{offer.decision_reason || "-"}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No retention offers have been recorded for this case yet.
            </Text>
          )}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Technical metadata</Heading>
        </div>
        <div className="px-6 py-4">
          {metadataRows.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {metadataRows.map((row) => (
                <DetailRow key={row.key} label={row.key} value={row.value} mono />
              ))}
            </div>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No metadata was stored for this case.
            </Text>
          )}
        </div>
      </Container>

      <Drawer open={actionDrawerOpen} onOpenChange={setActionDrawerOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>{getDrawerTitle(actionDrawerMode)}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 p-4">
            {formError ? <Alert variant="error">{formError}</Alert> : null}

            {actionDrawerMode === "reason" ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cancellation-reason">Reason</Label>
                  <Textarea
                    id="cancellation-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Capture the churn reason"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cancellation-reason-category">Reason category</Label>
                  <Select
                    value={reasonCategory}
                    onValueChange={(value) => setReasonCategory(value as ReasonCategory)}
                  >
                    <Select.Trigger id="cancellation-reason-category">
                      <Select.Value placeholder="Select a category" />
                    </Select.Trigger>
                    <Select.Content>
                      {reasonCategoryOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cancellation-notes">Notes</Label>
                  <Textarea
                    id="cancellation-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional operator notes"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reason-update-explanation">Change reason</Label>
                  <Input
                    id="reason-update-explanation"
                    value={updateReasonExplanation}
                    onChange={(event) => setUpdateReasonExplanation(event.target.value)}
                    placeholder="Optional explanation for the update"
                  />
                </div>
              </div>
            ) : null}

            {actionDrawerMode === "apply_offer" ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="offer-type">Offer type</Label>
                  <Select
                    value={offerType}
                    onValueChange={(value) => setOfferType(value as OfferType)}
                  >
                    <Select.Trigger id="offer-type">
                      <Select.Value placeholder="Select offer type" />
                    </Select.Trigger>
                    <Select.Content>
                      {offerTypeOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>

                {offerType === "pause_offer" ? (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pause-cycles">Pause cycles</Label>
                      <Input
                        id="pause-cycles"
                        type="number"
                        min={1}
                        step={1}
                        value={pauseCycles}
                        onChange={(event) => setPauseCycles(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="resume-at">Resume at</Label>
                      <Input
                        id="resume-at"
                        type="datetime-local"
                        value={resumeAt}
                        onChange={(event) => setResumeAt(event.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                {offerType === "discount_offer" ? (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="discount-type">Discount type</Label>
                      <Select
                        value={discountType}
                        onValueChange={(value) =>
                          setDiscountType(value as "percentage" | "fixed")
                        }
                      >
                        <Select.Trigger id="discount-type">
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {discountTypeOptions.map((option) => (
                            <Select.Item key={option.value} value={option.value}>
                              {option.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="discount-value">Discount value</Label>
                      <Input
                        id="discount-value"
                        type="number"
                        min={0}
                        step="0.01"
                        value={discountValue}
                        onChange={(event) => setDiscountValue(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="discount-duration-cycles">Duration cycles</Label>
                      <Input
                        id="discount-duration-cycles"
                        type="number"
                        min={1}
                        step={1}
                        value={discountDurationCycles}
                        onChange={(event) =>
                          setDiscountDurationCycles(event.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : null}

                {offerType === "bonus_offer" ? (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="bonus-type">Bonus type</Label>
                      <Select
                        value={bonusType}
                        onValueChange={(value) =>
                          setBonusType(value as "free_cycle" | "gift" | "credit")
                        }
                      >
                        <Select.Trigger id="bonus-type">
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {bonusTypeOptions.map((option) => (
                            <Select.Item key={option.value} value={option.value}>
                              {option.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="bonus-value">Value</Label>
                      <Input
                        id="bonus-value"
                        type="number"
                        min={0}
                        step="0.01"
                        value={bonusValue}
                        onChange={(event) => setBonusValue(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="bonus-label">Label</Label>
                      <Input
                        id="bonus-label"
                        value={bonusLabel}
                        onChange={(event) => setBonusLabel(event.target.value)}
                        placeholder="Optional label"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="bonus-duration-cycles">Duration cycles</Label>
                      <Input
                        id="bonus-duration-cycles"
                        type="number"
                        min={1}
                        step={1}
                        value={bonusDurationCycles}
                        onChange={(event) => setBonusDurationCycles(event.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="offer-note">Offer note</Label>
                  <Textarea
                    id="offer-note"
                    value={offerNote}
                    onChange={(event) => setOfferNote(event.target.value)}
                    placeholder="Optional note attached to the offer payload"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="decision-reason">Decision reason</Label>
                  <Textarea
                    id="decision-reason"
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                    placeholder="Optional reason or customer response"
                  />
                </div>
              </div>
            ) : null}

            {actionDrawerMode === "finalize" ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="finalize-reason">Reason</Label>
                  <Textarea
                    id="finalize-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Reason is required before final cancel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="finalize-reason-category">Reason category</Label>
                  <Select
                    value={reasonCategory}
                    onValueChange={(value) => setReasonCategory(value as ReasonCategory)}
                  >
                    <Select.Trigger id="finalize-reason-category">
                      <Select.Value placeholder="Select a category" />
                    </Select.Trigger>
                    <Select.Content>
                      {reasonCategoryOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="finalize-notes">Notes</Label>
                  <Textarea
                    id="finalize-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional final cancellation notes"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="effective-at">Effective at</Label>
                  <Select
                    value={effectiveAt}
                    onValueChange={(value) =>
                      setEffectiveAt(value as "immediately" | "end_of_cycle")
                    }
                  >
                    <Select.Trigger id="effective-at">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {effectiveAtOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              </div>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={
                    applyOfferMutation.isPending ||
                    finalizeMutation.isPending ||
                    updateReasonMutation.isPending
                  }
                >
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                type="button"
                onClick={() => {
                  void handleSubmitDrawer()
                }}
                isLoading={
                  actionDrawerMode === "apply_offer"
                    ? applyOfferMutation.isPending
                    : actionDrawerMode === "finalize"
                      ? finalizeMutation.isPending
                      : updateReasonMutation.isPending
                }
                disabled={
                  applyOfferMutation.isPending ||
                  finalizeMutation.isPending ||
                  updateReasonMutation.isPending
                }
              >
                {actionDrawerMode === "apply_offer"
                  ? "Apply offer"
                  : actionDrawerMode === "finalize"
                    ? "Continue"
                    : "Save"}
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export default CancellationDetailPage

export const handle = {
  breadcrumb: ({ params, data }: UIMatch<CancellationCaseAdminDetailResponse>) =>
    params?.id || data?.cancellation?.id || "Cancellation",
}

const DetailBlock = ({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: ReactNode }>
}) => {
  return (
    <div className="rounded-lg border border-ui-border-base p-4">
      <div className="mb-4">
        <Text size="small" leading="compact" weight="plus">
          {title}
        </Text>
      </div>
      <div className="grid gap-4">
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  )
}

const DetailRow = ({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) => {
  return (
    <div className="flex flex-col gap-y-1">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text
        size="small"
        leading="compact"
        className={mono ? "font-mono whitespace-pre-wrap" : undefined}
      >
        {value}
      </Text>
    </div>
  )
}

function getDrawerTitle(mode: ActionDrawerMode) {
  switch (mode) {
    case "apply_offer":
      return "Apply retention offer"
    case "finalize":
      return "Finalize cancellation"
    case "reason":
      return "Update reason"
  }
}

function normalizeOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizeRequiredString(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function parseNullablePositiveInt(value: string) {
  const normalized = normalizeOptionalString(value)

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function parsePositiveNumber(value: string) {
  const normalized = normalizeOptionalString(value)

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function parseNullableNonNegativeNumber(value: string) {
  const normalized = normalizeOptionalString(value)

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCaseStatus(status: CancellationCaseAdminStatus) {
  switch (status) {
    case "requested":
      return "Requested"
    case "evaluating_retention":
      return "Evaluating retention"
    case "retention_offered":
      return "Retention offered"
    case "retained":
      return "Retained"
    case "paused":
      return "Paused"
    case "canceled":
      return "Canceled"
  }
}

function getCaseStatusColor(status: CancellationCaseAdminStatus) {
  switch (status) {
    case "requested":
      return "grey"
    case "evaluating_retention":
      return "blue"
    case "retention_offered":
      return "orange"
    case "retained":
      return "green"
    case "paused":
      return "orange"
    case "canceled":
      return "red"
  }
}

function formatFinalOutcome(value: CancellationFinalOutcomeAdmin) {
  switch (value) {
    case "retained":
      return "Retained"
    case "paused":
      return "Paused"
    case "canceled":
      return "Canceled"
  }
}

function getFinalOutcomeColor(value: CancellationFinalOutcomeAdmin) {
  switch (value) {
    case "retained":
      return "green"
    case "paused":
      return "orange"
    case "canceled":
      return "red"
  }
}

function formatRecommendedAction(value: CancellationRecommendedActionAdmin | null) {
  if (!value) {
    return "No recommendation yet"
  }

  switch (value) {
    case "pause_offer":
      return "Pause offer"
    case "discount_offer":
      return "Discount offer"
    case "bonus_offer":
      return "Bonus offer"
    case "direct_cancel":
      return "Direct cancel"
  }
}

function formatReasonCategory(value: string | null) {
  if (!value) {
    return "Unclassified"
  }

  switch (value) {
    case "product_fit":
      return "Product fit"
    case "temporary_pause":
      return "Temporary pause"
    case "switched_competitor":
      return "Switched competitor"
    default:
      return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
  }
}

function formatSubscriptionStatus(
  status: CancellationCaseAdminDetail["subscription"]["status"]
) {
  switch (status) {
    case "active":
      return "Active"
    case "paused":
      return "Paused"
    case "cancelled":
      return "Cancelled"
    case "past_due":
      return "Past due"
  }
}

function formatDunningStatus(
  status: NonNullable<CancellationCaseAdminDetail["dunning"]>["status"]
) {
  switch (status) {
    case "open":
      return "Open"
    case "retry_scheduled":
      return "Retry scheduled"
    case "retrying":
      return "Retrying"
    case "awaiting_manual_resolution":
      return "Awaiting manual resolution"
    case "recovered":
      return "Recovered"
    case "unrecovered":
      return "Unrecovered"
  }
}

function formatRenewalStatus(
  status: NonNullable<CancellationCaseAdminDetail["renewal"]>["status"]
) {
  switch (status) {
    case "scheduled":
      return "Scheduled"
    case "processing":
      return "Processing"
    case "succeeded":
      return "Succeeded"
    case "failed":
      return "Failed"
  }
}

function formatApprovalStatus(
  status: NonNullable<CancellationCaseAdminDetail["renewal"]>["approval_status"]
) {
  switch (status) {
    case "pending":
      return "Pending"
    case "approved":
      return "Approved"
    case "rejected":
      return "Rejected"
  }
}

function formatOfferType(offerType: CancellationAdminOfferEventRecord["offer_type"]) {
  switch (offerType) {
    case "pause_offer":
      return "Pause offer"
    case "discount_offer":
      return "Discount offer"
    case "bonus_offer":
      return "Bonus offer"
  }
}

function formatOfferDecisionStatus(
  status: CancellationAdminOfferEventRecord["decision_status"]
) {
  switch (status) {
    case "proposed":
      return "Proposed"
    case "accepted":
      return "Accepted"
    case "rejected":
      return "Rejected"
    case "applied":
      return "Applied"
    case "expired":
      return "Expired"
  }
}

function getOfferDecisionColor(
  status: CancellationAdminOfferEventRecord["decision_status"]
) {
  switch (status) {
    case "proposed":
      return "grey"
    case "accepted":
      return "blue"
    case "rejected":
      return "red"
    case "applied":
      return "green"
    case "expired":
      return "orange"
  }
}

function describeOfferPayload(offer: CancellationAdminOfferEventRecord) {
  const payload = offer.offer_payload

  if (!payload) {
    return null
  }

  if ("pause_offer" in payload && payload.pause_offer) {
    const value = payload.pause_offer as {
      pause_cycles?: number | null
      resume_at?: string | null
      note?: string | null
    }

    return [
      value.pause_cycles ? `${value.pause_cycles} cycles` : null,
      value.resume_at ? `resume ${formatDateTime(value.resume_at)}` : null,
      value.note ?? null,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  if ("discount_offer" in payload && payload.discount_offer) {
    const value = payload.discount_offer as {
      discount_type?: string
      discount_value?: number
      duration_cycles?: number | null
      note?: string | null
    }

    return [
      value.discount_value !== undefined
        ? `${value.discount_value} ${value.discount_type === "percentage" ? "%" : "fixed"}`
        : null,
      value.duration_cycles ? `${value.duration_cycles} cycles` : null,
      value.note ?? null,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  if ("bonus_offer" in payload && payload.bonus_offer) {
    const value = payload.bonus_offer as {
      bonus_type?: string
      value?: number | null
      label?: string | null
      duration_cycles?: number | null
      note?: string | null
    }

    return [
      value.bonus_type ?? null,
      value.value !== null && value.value !== undefined ? `${value.value}` : null,
      value.label ?? null,
      value.duration_cycles ? `${value.duration_cycles} cycles` : null,
      value.note ?? null,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  return null
}

function formatEligibleActions(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return "No eligible actions recorded"
  }

  return value
    .map((entry) => formatRecommendedAction(entry as CancellationRecommendedActionAdmin))
    .join(", ")
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
