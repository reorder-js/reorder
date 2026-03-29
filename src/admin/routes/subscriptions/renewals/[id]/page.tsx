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
  Spinner,
  TriangleRightMini,
  XCircle,
} from "@medusajs/icons";
import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useMemo, useState } from "react";
import { Link, UIMatch, useParams } from "react-router-dom";
import { sdk } from "../../../../lib/client";
import {
  adminRenewalsQueryKeys,
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
      await invalidateRenewalQueries(queryClient, id);
      toast.success("Renewal forced");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to force renewal"
      );
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
      await invalidateRenewalQueries(queryClient, id);
      toast.success("Pending changes approved");
      setDecisionDrawerOpen(false);
      setDecisionReason("");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to approve changes"
      );
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
      await invalidateRenewalQueries(queryClient, id);
      toast.success("Pending changes rejected");
      setDecisionDrawerOpen(false);
      setDecisionReason("");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to reject changes"
      );
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
    const confirmReason = { value: "" };

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
      reason: normalizeOptionalString(confirmReason.value),
    });
  };

  const openDecisionDrawer = (mode: DecisionDrawerMode) => {
    setDecisionMode(mode);
    setDecisionReason("");
    setDecisionDrawerOpen(true);
  };

  const handleSubmitDecision = async () => {
    const normalizedReason = normalizeOptionalString(decisionReason);

    if (decisionMode === "reject" && !normalizedReason) {
      toast.error("Reason is required");
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
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
          <DetailBlock
            title="Cycle overview"
            rows={[
              {
                label: "Status",
                value: (
                  <StatusBadge color={getCycleStatusColor(renewal.status)}>
                    {formatCycleStatus(renewal.status)}
                  </StatusBadge>
                ),
              },
              { label: "Scheduled for", value: formatDateTime(renewal.scheduled_for) },
              { label: "Processed at", value: formatDateTime(renewal.processed_at) },
              { label: "Created at", value: formatDateTime(renewal.created_at) },
              {
                label: "Last error",
                value: renewal.last_error || "No error recorded",
              },
            ]}
          />
          <DetailBlock
            title="Approval summary"
            rows={[
              {
                label: "Approval",
                value: (
                  <StatusBadge color={getApprovalStatusColor(renewal.approval)}>
                    {formatApprovalStatus(renewal.approval)}
                  </StatusBadge>
                ),
              },
              {
                label: "Required",
                value: renewal.approval.required ? "Yes" : "No",
              },
              {
                label: "Decided at",
                value: formatDateTime(renewal.approval.decided_at),
              },
              {
                label: "Decided by",
                value: renewal.approval.decided_by || "-",
              },
              {
                label: "Reason",
                value: renewal.approval.reason || "-",
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
                    to={`/subscriptions/${renewal.subscription.subscription_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    {renewal.subscription.reference}
                  </Link>
                ),
              },
              { label: "Status", value: formatSubscriptionStatus(renewal.subscription.status) },
              { label: "Customer", value: renewal.subscription.customer_name },
              { label: "Product", value: renewal.subscription.product_title },
              { label: "Variant", value: renewal.subscription.variant_title },
              { label: "SKU", value: renewal.subscription.sku || "-" },
            ]}
          />
          <DetailBlock
            title="Generated order summary"
            rows={[
              {
                label: "Order",
                value: renewal.generated_order ? (
                  <Link
                    to={`/orders/${renewal.generated_order.order_id}`}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    #{renewal.generated_order.display_id}
                  </Link>
                ) : (
                  "No order generated"
                ),
              },
              {
                label: "Status",
                value: renewal.generated_order?.status || "-",
              },
              {
                label: "Order ID",
                value: renewal.generated_order?.order_id || "-",
              },
            ]}
          />
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

      <Drawer open={decisionDrawerOpen} onOpenChange={setDecisionDrawerOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {decisionMode === "approve" ? "Approve changes" : "Reject changes"}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 p-4">
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
                <Button size="small" variant="secondary" type="button">
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

async function invalidateRenewalQueries(
  queryClient: QueryClient,
  id?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminRenewalsQueryKeys.all,
    }),
    id
      ? queryClient.invalidateQueries({
          queryKey: adminRenewalsQueryKeys.detail(id),
        })
      : Promise.resolve(),
  ]);
}

const DetailBlock = ({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: ReactNode }>;
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
  );
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
