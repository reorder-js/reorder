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
  Spinner,
  TriangleRightMini,
  XCircle,
} from "@medusajs/icons"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ReactNode, useMemo, useState } from "react"
import { Link, UIMatch, useParams } from "react-router-dom"
import { sdk } from "../../../../lib/client"
import {
  invalidateAdminDunningQueries,
  useAdminDunningDetailQuery,
} from "../data-loading"
import {
  DunningAttemptAdminStatus,
  DunningCaseAdminDetail,
  DunningCaseAdminDetailResponse,
  DunningCaseAdminStatus,
  MarkRecoveredDunningAdminRequest,
  MarkUnrecoveredDunningAdminRequest,
  RetryNowDunningAdminRequest,
  UpdateDunningRetryScheduleAdminRequest,
} from "../../../../types/dunning"

type ActionDrawerMode = "mark_recovered" | "mark_unrecovered" | "retry_schedule"

const terminalStatuses = new Set<DunningCaseAdminStatus>([
  DunningCaseAdminStatus.RECOVERED,
  DunningCaseAdminStatus.UNRECOVERED,
])

const DunningDetailPage = () => {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false)
  const [actionDrawerMode, setActionDrawerMode] =
    useState<ActionDrawerMode>("retry_schedule")
  const [reason, setReason] = useState("")
  const [intervals, setIntervals] = useState("1440, 4320, 10080")
  const [maxAttempts, setMaxAttempts] = useState("3")
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useAdminDunningDetailQuery(id)
  const dunningCase = data?.dunning_case

  const retryNowMutation = useMutation({
    mutationFn: async (body: RetryNowDunningAdminRequest) =>
      sdk.client.fetch<DunningCaseAdminDetailResponse>(
        `/admin/dunning/${id}/retry-now`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminDunningQueries(queryClient, id)
      toast.success("Retry started")
    },
    onError: (mutationError) => {
      toast.error(getAdminErrorMessage(mutationError, "Failed to retry now"))
    },
  })

  const markRecoveredMutation = useMutation({
    mutationFn: async (body: MarkRecoveredDunningAdminRequest) =>
      sdk.client.fetch<DunningCaseAdminDetailResponse>(
        `/admin/dunning/${id}/mark-recovered`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminDunningQueries(queryClient, id)
      toast.success("Case marked as recovered")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to mark as recovered"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const markUnrecoveredMutation = useMutation({
    mutationFn: async (body: MarkUnrecoveredDunningAdminRequest) =>
      sdk.client.fetch<DunningCaseAdminDetailResponse>(
        `/admin/dunning/${id}/mark-unrecovered`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminDunningQueries(queryClient, id)
      toast.success("Case marked as unrecovered")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to mark as unrecovered"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const retryScheduleMutation = useMutation({
    mutationFn: async (body: UpdateDunningRetryScheduleAdminRequest) =>
      sdk.client.fetch<DunningCaseAdminDetailResponse>(
        `/admin/dunning/${id}/retry-schedule`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminDunningQueries(queryClient, id)
      toast.success("Retry schedule updated")
      closeDrawer()
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to update retry schedule"
      )
      setFormError(message)
      toast.error(message)
    },
  })

  const metadataRows = useMemo(() => {
    if (!dunningCase?.metadata) {
      return []
    }

    return Object.entries(dunningCase.metadata).map(([key, value]) => ({
      key,
      value:
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }))
  }, [dunningCase])

  const canRetryNow = dunningCase
    ? !terminalStatuses.has(dunningCase.status) &&
      dunningCase.status !== DunningCaseAdminStatus.RETRYING
    : false
  const canMarkRecovered = canRetryNow
  const canMarkUnrecovered = canRetryNow
  const canEditRetrySchedule = canRetryNow
  const isActionPending =
    retryNowMutation.isPending ||
    markRecoveredMutation.isPending ||
    markUnrecoveredMutation.isPending ||
    retryScheduleMutation.isPending

  const openDrawer = (mode: ActionDrawerMode) => {
    setActionDrawerMode(mode)
    setReason("")
    setFormError(null)

    if (mode === "retry_schedule") {
      setIntervals(
        dunningCase?.retry_schedule?.intervals.join(", ") ?? "1440, 4320, 10080"
      )
      setMaxAttempts(
        dunningCase?.max_attempts?.toString() ??
          dunningCase?.retry_schedule?.intervals.length.toString() ??
          "3"
      )
    }

    setActionDrawerOpen(true)
  }

  const closeDrawer = () => {
    setActionDrawerOpen(false)
    setReason("")
    setFormError(null)
  }

  const handleRetryNow = async () => {
    const confirmed = await prompt({
      title: "Retry payment now?",
      description:
        "You are about to trigger an immediate payment retry for this dunning case.",
      confirmText: "Retry now",
      cancelText: "Cancel",
    })

    if (!confirmed) {
      return
    }

    await retryNowMutation.mutateAsync({
      reason: undefined,
    })
  }

  const handleSubmitDrawer = async () => {
    const normalizedReason = normalizeOptionalString(reason)

    if (actionDrawerMode === "mark_unrecovered" && !normalizedReason) {
      setFormError("Reason is required")
      toast.error("Reason is required")
      return
    }

    if (actionDrawerMode === "retry_schedule") {
      const normalizedIntervals = parseIntervals(intervals)
      const normalizedMaxAttempts = Number(maxAttempts)

      if (!normalizedIntervals.length) {
        setFormError("At least one retry interval is required")
        toast.error("At least one retry interval is required")
        return
      }

      if (!Number.isInteger(normalizedMaxAttempts) || normalizedMaxAttempts <= 0) {
        setFormError("Max attempts must be a positive integer")
        toast.error("Max attempts must be a positive integer")
        return
      }

      if (normalizedIntervals.length !== normalizedMaxAttempts) {
        setFormError("Max attempts must equal the number of retry intervals")
        toast.error("Max attempts must equal the number of retry intervals")
        return
      }

      await retryScheduleMutation.mutateAsync({
        reason: normalizedReason,
        intervals: normalizedIntervals,
        max_attempts: normalizedMaxAttempts,
      })
      return
    }

    const confirmed = await prompt({
      title:
        actionDrawerMode === "mark_recovered"
          ? "Mark as recovered?"
          : "Mark as unrecovered?",
      description:
        actionDrawerMode === "mark_recovered"
          ? "You are about to close this case as recovered."
          : "You are about to close this case as unrecovered.",
      confirmText:
        actionDrawerMode === "mark_recovered"
          ? "Mark recovered"
          : "Mark unrecovered",
      cancelText: "Cancel",
    })

    if (!confirmed) {
      return
    }

    if (actionDrawerMode === "mark_recovered") {
      await markRecoveredMutation.mutateAsync({
        reason: normalizedReason,
      })
      return
    }

    await markUnrecoveredMutation.mutateAsync({
      reason: normalizedReason!,
    })
  }

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Dunning case</Heading>
        </div>
        <div className="flex items-center gap-x-2 px-6 py-6 text-ui-fg-subtle">
          <Spinner className="animate-spin" />
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Loading dunning case details...
          </Text>
        </div>
      </Container>
    )
  }

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Dunning case</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error
              ? error.message
              : "Failed to load dunning case details."}
          </Alert>
        </div>
      </Container>
    )
  }

  if (!dunningCase) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Dunning case</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="warning">Dunning case details are unavailable.</Alert>
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
              Dunning case
            </Text>
            <Heading level="h1">{dunningCase.id}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Review recovery state, linked records, retry timing, and attempt history.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <StatusBadge color={getCaseStatusColor(dunningCase.status)}>
              {formatCaseStatus(dunningCase.status)}
            </StatusBadge>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton size="small" variant="transparent" disabled={isActionPending}>
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {canRetryNow ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => {
                      void handleRetryNow()
                    }}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>{retryNowMutation.isPending ? "Retrying..." : "Retry now"}</span>
                  </DropdownMenu.Item>
                ) : null}
                {canMarkRecovered ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDrawer("mark_recovered")}
                  >
                    <CheckCircle className="text-ui-fg-subtle" />
                    <span>Mark recovered</span>
                  </DropdownMenu.Item>
                ) : null}
                {canMarkUnrecovered ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDrawer("mark_unrecovered")}
                  >
                    <XCircle className="text-ui-fg-subtle" />
                    <span>Mark unrecovered</span>
                  </DropdownMenu.Item>
                ) : null}
                {canEditRetrySchedule ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDrawer("retry_schedule")}
                  >
                    <EllipsisHorizontal className="text-ui-fg-subtle" />
                    <span>Edit retry schedule</span>
                  </DropdownMenu.Item>
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
                  <StatusBadge color={getCaseStatusColor(dunningCase.status)}>
                    {formatCaseStatus(dunningCase.status)}
                  </StatusBadge>
                ),
              },
              { label: "Attempt count", value: `${dunningCase.attempt_count} / ${dunningCase.max_attempts}` },
              { label: "Next retry", value: formatDateTime(dunningCase.next_retry_at) },
              { label: "Last attempt", value: formatDateTime(dunningCase.last_attempt_at) },
              { label: "Recovered at", value: formatDateTime(dunningCase.recovered_at) },
              { label: "Closed at", value: formatDateTime(dunningCase.closed_at) },
              { label: "Created at", value: formatDateTime(dunningCase.created_at) },
              { label: "Updated at", value: formatDateTime(dunningCase.updated_at) },
            ]}
          />
          <DetailBlock
            title="Payment summary"
            rows={[
              { label: "Last error code", value: dunningCase.last_payment_error_code || "-" },
              {
                label: "Last error message",
                value: dunningCase.last_payment_error_message || "No payment error message",
              },
              {
                label: "Recovery reason",
                value: dunningCase.recovery_reason || "-",
              },
              {
                label: "Provider",
                value: dunningCase.subscription.payment_provider_id || "-",
              },
              {
                label: "Latest payment reference",
                value:
                  dunningCase.attempts[dunningCase.attempts.length - 1]?.payment_reference ||
                  "-",
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
                    to={`/subscriptions/${dunningCase.subscription.subscription_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    {dunningCase.subscription.reference}
                  </Link>
                ),
              },
              {
                label: "Status",
                value: formatSubscriptionStatus(dunningCase.subscription.status),
              },
              { label: "Customer", value: dunningCase.subscription.customer_name },
              { label: "Product", value: dunningCase.subscription.product_title },
              { label: "Variant", value: dunningCase.subscription.variant_title },
              { label: "SKU", value: dunningCase.subscription.sku || "-" },
            ]}
          />
          <DetailBlock
            title="Renewal summary"
            rows={[
              {
                label: "Renewal",
                value: dunningCase.renewal ? (
                  <Link
                    to={`/subscriptions/renewals/${dunningCase.renewal.renewal_cycle_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    {dunningCase.renewal.renewal_cycle_id}
                  </Link>
                ) : (
                  "No linked renewal"
                ),
              },
              {
                label: "Renewal status",
                value: dunningCase.renewal
                  ? formatRenewalStatus(dunningCase.renewal.status)
                  : "-",
              },
              {
                label: "Scheduled for",
                value: formatDateTime(dunningCase.renewal?.scheduled_for ?? null),
              },
              {
                label: "Generated order id",
                value: dunningCase.renewal?.generated_order_id || "-",
              },
            ]}
          />
          <DetailBlock
            title="Order / payment summary"
            rows={[
              {
                label: "Order",
                value: dunningCase.order ? (
                  <Link
                    to={`/orders/${dunningCase.order.order_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    #{dunningCase.order.display_id}
                  </Link>
                ) : (
                  "No linked order"
                ),
              },
              { label: "Order status", value: dunningCase.order?.status || "-" },
              { label: "Order ID", value: dunningCase.order?.order_id || "-" },
            ]}
          />
          <DetailBlock
            title="Retry schedule"
            rows={[
              {
                label: "Strategy",
                value: dunningCase.retry_schedule?.strategy || "-",
              },
              {
                label: "Intervals",
                value: dunningCase.retry_schedule
                  ? formatIntervals(dunningCase.retry_schedule.intervals)
                  : "-",
              },
              {
                label: "Timezone",
                value: dunningCase.retry_schedule?.timezone || "-",
              },
              {
                label: "Source",
                value: dunningCase.retry_schedule?.source || "-",
              },
            ]}
          />
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Attempt timeline</Heading>
        </div>
        <div className="px-6 py-4">
          {dunningCase.attempts.length ? (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Attempt</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Started</Table.HeaderCell>
                  <Table.HeaderCell>Finished</Table.HeaderCell>
                  <Table.HeaderCell>Error</Table.HeaderCell>
                  <Table.HeaderCell>Payment reference</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {dunningCase.attempts.map((attempt) => (
                  <Table.Row key={attempt.id}>
                    <Table.Cell>
                      <Text size="small" leading="compact" weight="plus">
                        #{attempt.attempt_no}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={getAttemptStatusColor(attempt.status)}>
                        {formatAttemptStatus(attempt.status)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{formatDateTime(attempt.started_at)}</Table.Cell>
                    <Table.Cell>{formatDateTime(attempt.finished_at)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-col gap-y-0.5">
                        <Text size="small" leading="compact">
                          {attempt.error_code || "-"}
                        </Text>
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          {attempt.error_message || "No error message"}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{attempt.payment_reference || "-"}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No attempts have been recorded for this dunning case yet.
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
              No metadata was stored for this dunning case.
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
            {actionDrawerMode === "retry_schedule" ? (
              <>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="retry-intervals">Retry intervals (minutes)</Label>
                  <Input
                    id="retry-intervals"
                    value={intervals}
                    onChange={(event) => setIntervals(event.target.value)}
                    placeholder="1440, 4320, 10080"
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="retry-max-attempts">Max attempts</Label>
                  <Input
                    id="retry-max-attempts"
                    type="number"
                    min={1}
                    value={maxAttempts}
                    onChange={(event) => setMaxAttempts(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="dunning-reason">
                {actionDrawerMode === "mark_unrecovered" ? "Reason *" : "Reason"}
              </Label>
              <Textarea
                id="dunning-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  actionDrawerMode === "retry_schedule"
                    ? "Optional note about this retry policy override"
                    : actionDrawerMode === "mark_recovered"
                      ? "Optional recovery note"
                      : "Required reason"
                }
              />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={isActionPending}
                >
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                type="button"
                isLoading={isActionPending}
                disabled={isActionPending}
                onClick={() => {
                  void handleSubmitDrawer()
                }}
              >
                {getDrawerSubmitLabel(actionDrawerMode)}
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export default DunningDetailPage

export const handle = {
  breadcrumb: ({ params, data }: UIMatch<DunningCaseAdminDetailResponse>) =>
    params?.id || data?.dunning_case?.id || "Dunning",
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

function normalizeOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function parseIntervals(value: string) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part > 0)
}

function getDrawerTitle(mode: ActionDrawerMode) {
  switch (mode) {
    case "mark_recovered":
      return "Mark recovered"
    case "mark_unrecovered":
      return "Mark unrecovered"
    case "retry_schedule":
      return "Edit retry schedule"
  }
}

function getDrawerSubmitLabel(mode: ActionDrawerMode) {
  switch (mode) {
    case "mark_recovered":
      return "Mark recovered"
    case "mark_unrecovered":
      return "Mark unrecovered"
    case "retry_schedule":
      return "Save schedule"
  }
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

function formatCaseStatus(status: DunningCaseAdminStatus) {
  switch (status) {
    case DunningCaseAdminStatus.OPEN:
      return "Open"
    case DunningCaseAdminStatus.RETRY_SCHEDULED:
      return "Retry scheduled"
    case DunningCaseAdminStatus.RETRYING:
      return "Retrying"
    case DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION:
      return "Awaiting manual resolution"
    case DunningCaseAdminStatus.RECOVERED:
      return "Recovered"
    case DunningCaseAdminStatus.UNRECOVERED:
      return "Unrecovered"
  }
}

function getCaseStatusColor(status: DunningCaseAdminStatus) {
  switch (status) {
    case DunningCaseAdminStatus.OPEN:
      return "orange"
    case DunningCaseAdminStatus.RETRY_SCHEDULED:
      return "orange"
    case DunningCaseAdminStatus.RETRYING:
      return "blue"
    case DunningCaseAdminStatus.AWAITING_MANUAL_RESOLUTION:
      return "grey"
    case DunningCaseAdminStatus.RECOVERED:
      return "green"
    case DunningCaseAdminStatus.UNRECOVERED:
      return "red"
  }
}

function formatAttemptStatus(status: DunningAttemptAdminStatus) {
  switch (status) {
    case DunningAttemptAdminStatus.PROCESSING:
      return "Processing"
    case DunningAttemptAdminStatus.SUCCEEDED:
      return "Succeeded"
    case DunningAttemptAdminStatus.FAILED:
      return "Failed"
  }
}

function getAttemptStatusColor(status: DunningAttemptAdminStatus) {
  switch (status) {
    case DunningAttemptAdminStatus.PROCESSING:
      return "blue"
    case DunningAttemptAdminStatus.SUCCEEDED:
      return "green"
    case DunningAttemptAdminStatus.FAILED:
      return "red"
  }
}

function formatSubscriptionStatus(
  status: DunningCaseAdminDetail["subscription"]["status"]
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

function formatRenewalStatus(
  status: NonNullable<DunningCaseAdminDetail["renewal"]>["status"]
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

function formatIntervals(intervals: number[]) {
  return intervals.map((interval) => `${interval} min`).join(", ")
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
