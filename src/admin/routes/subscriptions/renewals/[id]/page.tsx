import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
  Alert,
  Button,
  Container,
  Drawer,
  DropdownMenu,
  Heading,
  IconButton,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui";
import {
  CheckCircle,
  EllipsisHorizontal,
  ShoppingBag,
  Spinner,
  TriangleRightMini,
  XCircle,
} from "@medusajs/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useMemo, useState } from "react";
import { Link, UIMatch, useParams } from "react-router-dom";
import { sdk } from "../../../../lib/client";
import {
  invalidateAdminRenewalsQueries,
  useAdminRenewalDetailQuery,
} from "../data-loading";
import {
  ApproveRenewalChangesAdminRequest,
  ForceRenewalAdminRequest,
  RejectRenewalChangesAdminRequest,
  RenewalAdminApprovalSummary,
  RenewalApprovalStatus,
  RenewalAttemptAdminStatus,
  RenewalCycleAdminDetail,
  RenewalCycleAdminDetailResponse,
  RenewalCycleAdminStatus,
} from "../../../../types/renewal";

const forceableStatuses = new Set<RenewalCycleAdminStatus>([
  RenewalCycleAdminStatus.SCHEDULED,
  RenewalCycleAdminStatus.FAILED,
]);

type DecisionDrawerMode = "approve" | "reject";

const RenewalDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const [decisionDrawerOpen, setDecisionDrawerOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<DecisionDrawerMode>("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useAdminRenewalDetailQuery(id);
  const renewal = data?.renewal;

  const forceMutation = useMutation({
    mutationFn: async (body: ForceRenewalAdminRequest) =>
      sdk.client.fetch<RenewalCycleAdminDetailResponse>(
        `/admin/renewals/${id}/force`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminRenewalsQueries(
        queryClient,
        id,
        renewal?.subscription.subscription_id
      );
      toast.success("Renewal forced");
    },
    onError: (mutationError) => {
      toast.error(getAdminErrorMessage(mutationError, "Failed to force renewal"));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (body: ApproveRenewalChangesAdminRequest) =>
      sdk.client.fetch<RenewalCycleAdminDetailResponse>(
        `/admin/renewals/${id}/approve-changes`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminRenewalsQueries(
        queryClient,
        id,
        renewal?.subscription.subscription_id
      );
      toast.success("Pending changes approved");
      setDecisionDrawerOpen(false);
      setDecisionReason("");
      setDecisionError(null);
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to approve changes"
      );

      setDecisionError(message);
      toast.error(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (body: RejectRenewalChangesAdminRequest) =>
      sdk.client.fetch<RenewalCycleAdminDetailResponse>(
        `/admin/renewals/${id}/reject-changes`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: async () => {
      await invalidateAdminRenewalsQueries(
        queryClient,
        id,
        renewal?.subscription.subscription_id
      );
      toast.success("Pending changes rejected");
      setDecisionDrawerOpen(false);
      setDecisionReason("");
      setDecisionError(null);
    },
    onError: (mutationError) => {
      const message = getAdminErrorMessage(
        mutationError,
        "Failed to reject changes"
      );

      setDecisionError(message);
      toast.error(message);
    },
  });

  const canForce = renewal ? forceableStatuses.has(renewal.status) : false;
  const canDecideApproval = renewal
    ? renewal.approval.required &&
      renewal.approval.status === RenewalApprovalStatus.PENDING
    : false;
  const isActionPending =
    forceMutation.isPending || approveMutation.isPending || rejectMutation.isPending;

  const metadataRows = useMemo(() => {
    if (!renewal?.metadata) {
      return [];
    }

    return Object.entries(renewal.metadata).map(([key, value]) => ({
      key,
      value:
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }));
  }, [renewal]);

  const handleForceRenewal = async () => {
    const confirmed = await prompt({
      title: "Force renewal?",
      description:
        "You are about to manually trigger this renewal cycle. Do you want to continue?",
      confirmText: "Force renewal",
      cancelText: "Cancel",
    });

    if (!confirmed) {
      return;
    }

    await forceMutation.mutateAsync({
      reason: undefined,
    });
  };

  const openDecisionDrawer = (mode: DecisionDrawerMode) => {
    setDecisionMode(mode);
    setDecisionReason("");
    setDecisionError(null);
    setDecisionDrawerOpen(true);
  };

  const handleSubmitDecision = async () => {
    const normalizedReason = normalizeOptionalString(decisionReason);

    if (decisionMode === "reject" && !normalizedReason) {
      setDecisionError("Reason is required");
      toast.error("Reason is required");
      return;
    }

    setDecisionError(null);

    const confirmed = await prompt({
      title:
        decisionMode === "approve"
          ? "Approve changes?"
          : "Reject changes?",
      description:
        decisionMode === "approve"
          ? "You are about to approve the pending changes for this renewal cycle."
          : "You are about to reject the pending changes for this renewal cycle.",
      confirmText: decisionMode === "approve" ? "Approve" : "Reject",
      cancelText: "Cancel",
    });

    if (!confirmed) {
      return;
    }

    if (decisionMode === "approve") {
      await approveMutation.mutateAsync({
        reason: normalizedReason,
      });
      return;
    }

    await rejectMutation.mutateAsync({
      reason: normalizedReason!,
    });
  };

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Renewal</Heading>
        </div>
        <div className="flex items-center gap-x-2 px-6 py-6 text-ui-fg-subtle">
          <Spinner className="animate-spin" />
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Loading renewal details...
          </Text>
        </div>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Renewal</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error
              ? error.message
              : "Failed to load renewal details."}
          </Alert>
        </div>
      </Container>
    );
  }

  if (!renewal) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Renewal</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="warning">Renewal details are unavailable.</Alert>
        </div>
      </Container>
    );
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Renewal cycle
            </Text>
            <Heading level="h1">{renewal.id}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Review execution status, approval state, linked records, and
              attempt history.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <StatusBadge color={getCycleStatusColor(renewal.status)}>
              {formatCycleStatus(renewal.status)}
            </StatusBadge>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton size="small" variant="transparent" disabled={isActionPending}>
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {canForce ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => {
                      void handleForceRenewal();
                    }}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>
                      {forceMutation.isPending ? "Forcing..." : "Force renewal"}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
                {canDecideApproval ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDecisionDrawer("approve")}
                  >
                    <CheckCircle className="text-ui-fg-subtle" />
                    <span>Approve changes</span>
                  </DropdownMenu.Item>
                ) : null}
                {canDecideApproval ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => openDecisionDrawer("reject")}
                  >
                    <XCircle className="text-ui-fg-subtle" />
                    <span>Reject changes</span>
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </div>
      </Container>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Cycle overview</Heading>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DetailRow
                  label="Status"
                  value={(
                    <StatusBadge color={getCycleStatusColor(renewal.status)}>
                      {formatCycleStatus(renewal.status)}
                    </StatusBadge>
                  )}
                />
                <DetailRow
                  label="Projected delivery"
                  value={formatDateTime(renewal.effective_scheduled_for)}
                />
                <DetailRow
                  label="Operational cycle"
                  value={formatDateTime(renewal.scheduled_for)}
                />
                <DetailRow
                  label="Processed at"
                  value={formatDateTime(renewal.processed_at)}
                />
                <DetailRow
                  label="Created at"
                  value={formatDateTime(renewal.created_at)}
                />
                <DetailRow
                  label="Last error"
                  value={renewal.last_error || "No error recorded"}
                />
              </div>
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Approval summary</Heading>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DetailRow
                  label="Approval"
                  value={(
                    <StatusBadge color={getApprovalStatusColor(renewal.approval)}>
                      {formatApprovalStatus(renewal.approval)}
                    </StatusBadge>
                  )}
                />
                <DetailRow
                  label="Required"
                  value={renewal.approval.required ? "Yes" : "No"}
                />
                <DetailRow
                  label="Decided at"
                  value={formatDateTime(renewal.approval.decided_at)}
                />
                <DetailRow
                  label="Decided by"
                  value={renewal.approval.decided_by || "-"}
                />
                <DetailRow label="Reason" value={renewal.approval.reason || "-"} />
              </div>
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Pending changes</Heading>
            </div>
            <div className="px-6 py-4">
              {renewal.pending_changes ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DetailRow
                    label="Variant"
                    value={renewal.pending_changes.variant_title}
                  />
                  <DetailRow
                    label="Frequency"
                    value={formatFrequency(
                      renewal.pending_changes.frequency_interval,
                      renewal.pending_changes.frequency_value
                    )}
                  />
                  <DetailRow
                    label="Effective at"
                    value={formatDateTime(renewal.pending_changes.effective_at)}
                  />
                  <DetailRow
                    label="Variant ID"
                    value={renewal.pending_changes.variant_id}
                  />
                </div>
              ) : (
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  No pending changes are attached to this renewal cycle.
                </Text>
              )}
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Attempt history</Heading>
            </div>
            <div className="px-6 py-4">
              {renewal.attempts.length ? (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Attempt</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Started</Table.HeaderCell>
                      <Table.HeaderCell>Finished</Table.HeaderCell>
                      <Table.HeaderCell>Error</Table.HeaderCell>
                      <Table.HeaderCell>Order</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {renewal.attempts.map((attempt) => (
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
                        <Table.Cell>{attempt.order_id || "-"}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              ) : (
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  No attempts have been recorded for this renewal cycle yet.
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
                  No metadata was stored for this renewal cycle.
                </Text>
              )}
            </div>
          </Container>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Subscription summary</Heading>
            </div>
            <div className="px-6 py-4">
              <div className="grid gap-4">
                <Link
                  to={`/subscriptions/${renewal.subscription.subscription_id}`}
                  className="outline-none focus-within:shadow-borders-interactive-with-focus rounded-md [&:hover>div]:bg-ui-bg-component-hover"
                >
                  <div className="shadow-elevation-card-rest bg-ui-bg-component rounded-md px-4 py-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="shadow-elevation-card-rest flex h-14 w-14 items-center justify-center rounded-md text-ui-fg-muted">
                        <Text size="small" leading="compact" weight="plus">
                          SUB
                        </Text>
                      </div>
                      <div className="flex flex-1 flex-col">
                        <Text size="small" leading="compact" weight="plus">
                          {renewal.subscription.reference}
                        </Text>
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          {renewal.subscription.customer_name}
                        </Text>
                      </div>
                      <div className="size-7 flex items-center justify-center">
                        <TriangleRightMini className="text-ui-fg-muted rtl:rotate-180" />
                      </div>
                    </div>
                  </div>
                </Link>
                <DetailRow
                  label="Status"
                  value={formatSubscriptionStatus(renewal.subscription.status)}
                />
                <DetailRow
                  label="Customer"
                  value={renewal.subscription.customer_name}
                />
                <DetailRow label="Product" value={renewal.subscription.product_title} />
                <DetailRow label="Variant" value={renewal.subscription.variant_title} />
                <DetailRow label="SKU" value={renewal.subscription.sku || "-"} />
              </div>
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Generated order summary</Heading>
            </div>
            <div className="px-6 py-4">
              <div className="grid gap-4">
                {renewal.generated_order ? (
                  <Link
                    to={`/orders/${renewal.generated_order.order_id}`}
                    className="outline-none focus-within:shadow-borders-interactive-with-focus rounded-md [&:hover>div]:bg-ui-bg-component-hover"
                  >
                    <div className="shadow-elevation-card-rest bg-ui-bg-component rounded-md px-4 py-2 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="shadow-elevation-card-rest flex h-14 w-14 items-center justify-center rounded-md text-ui-fg-muted">
                          <ShoppingBag />
                        </div>
                        <div className="flex flex-1 flex-col">
                          <Text size="small" leading="compact" weight="plus">
                            #{renewal.generated_order.display_id}
                          </Text>
                          <Text
                            size="small"
                            leading="compact"
                            className="text-ui-fg-subtle"
                          >
                            {renewal.generated_order.status}
                          </Text>
                        </div>
                        <div className="size-7 flex items-center justify-center">
                          <TriangleRightMini className="text-ui-fg-muted rtl:rotate-180" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    No order generated
                  </Text>
                )}
                <DetailRow
                  label="Status"
                  value={renewal.generated_order?.status || "-"}
                />
                <DetailRow
                  label="Order ID"
                  value={renewal.generated_order?.order_id || "-"}
                />
              </div>
            </div>
          </Container>
        </div>
      </div>

      <Drawer open={decisionDrawerOpen} onOpenChange={setDecisionDrawerOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {decisionMode === "approve" ? "Approve changes" : "Reject changes"}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 p-4">
            {decisionError ? <Alert variant="error">{decisionError}</Alert> : null}
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="decision-reason">
                {decisionMode === "approve" ? "Reason" : "Reason *"}
              </Label>
              <Textarea
                id="decision-reason"
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                placeholder={
                  decisionMode === "approve"
                    ? "Optional review note"
                    : "Required rejection reason"
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
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                >
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                type="button"
                isLoading={
                  decisionMode === "approve"
                    ? approveMutation.isPending
                    : rejectMutation.isPending
                }
                disabled={approveMutation.isPending || rejectMutation.isPending}
                onClick={() => {
                  void handleSubmitDecision();
                }}
              >
                {decisionMode === "approve" ? "Approve" : "Reject"}
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  );
};

export default RenewalDetailPage;

export const handle = {
  breadcrumb: ({ params, data }: UIMatch<RenewalCycleAdminDetailResponse>) =>
    params?.id || data?.renewal?.id || "Renewal",
};

const DetailRow = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
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
  );
};

function normalizeOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCycleStatus(status: RenewalCycleAdminStatus) {
  switch (status) {
    case RenewalCycleAdminStatus.SCHEDULED:
      return "Scheduled";
    case RenewalCycleAdminStatus.PROCESSING:
      return "Processing";
    case RenewalCycleAdminStatus.SUCCEEDED:
      return "Succeeded";
    case RenewalCycleAdminStatus.FAILED:
      return "Failed";
  }
}

function formatAttemptStatus(status: RenewalAttemptAdminStatus) {
  switch (status) {
    case RenewalAttemptAdminStatus.PROCESSING:
      return "Processing";
    case RenewalAttemptAdminStatus.SUCCEEDED:
      return "Succeeded";
    case RenewalAttemptAdminStatus.FAILED:
      return "Failed";
  }
}

function formatApprovalStatus(approval: RenewalAdminApprovalSummary) {
  if (!approval.required || !approval.status) {
    return "Not required";
  }

  switch (approval.status) {
    case RenewalApprovalStatus.PENDING:
      return "Pending approval";
    case RenewalApprovalStatus.APPROVED:
      return "Approved";
    case RenewalApprovalStatus.REJECTED:
      return "Rejected";
  }
}

function formatSubscriptionStatus(
  status: RenewalCycleAdminDetail["subscription"]["status"]
) {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    case "past_due":
      return "Past due";
  }
}

function formatFrequency(
  interval: "week" | "month" | "year",
  value: number
) {
  switch (interval) {
    case "week":
      return value === 1 ? "Every week" : `Every ${value} weeks`;
    case "month":
      return value === 1 ? "Every month" : `Every ${value} months`;
    case "year":
      return value === 1 ? "Every year" : `Every ${value} years`;
  }
}

function getCycleStatusColor(status: RenewalCycleAdminStatus) {
  switch (status) {
    case RenewalCycleAdminStatus.SCHEDULED:
      return "blue";
    case RenewalCycleAdminStatus.PROCESSING:
      return "orange";
    case RenewalCycleAdminStatus.SUCCEEDED:
      return "green";
    case RenewalCycleAdminStatus.FAILED:
      return "red";
  }
}

function getAttemptStatusColor(status: RenewalAttemptAdminStatus) {
  switch (status) {
    case RenewalAttemptAdminStatus.PROCESSING:
      return "orange";
    case RenewalAttemptAdminStatus.SUCCEEDED:
      return "green";
    case RenewalAttemptAdminStatus.FAILED:
      return "red";
  }
}

function getApprovalStatusColor(approval: RenewalAdminApprovalSummary) {
  if (!approval.required || !approval.status) {
    return "grey";
  }

  switch (approval.status) {
    case RenewalApprovalStatus.PENDING:
      return "orange";
    case RenewalApprovalStatus.APPROVED:
      return "green";
    case RenewalApprovalStatus.REJECTED:
      return "red";
  }
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  return getNestedErrorMessage(error) ?? fallback;
}

function getNestedErrorMessage(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return (
      getNestedErrorMessage((value as Error & { cause?: unknown }).cause) ??
      value.message
    );
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  return (
    getNestedErrorMessage(record.message) ??
    getNestedErrorMessage(record.error) ??
    getNestedErrorMessage(record.details) ??
    getNestedErrorMessage(record.response) ??
    getNestedErrorMessage(record.data) ??
    getNestedErrorMessage(record.body) ??
    getNestedErrorMessage(record.cause) ??
    null
  );
}
