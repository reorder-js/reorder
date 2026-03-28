import {
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Button,
  DropdownMenu,
  IconButton,
  StatusBadge,
  toast,
  usePrompt,
} from "@medusajs/ui";
import {
  EllipsisHorizontal,
  Pause,
  TriangleRightMini,
  Trash,
} from "@medusajs/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  LoaderFunctionArgs,
  UIMatch,
  useLoaderData,
  useParams,
} from "react-router-dom";
import { sdk } from "../../../lib/client";
import {
  adminSubscriptionsQueryKeys,
  useAdminSubscriptionDetailQuery,
  useAdminSubscriptionPlanOptionsQuery,
} from "../data-loading";
import {
  SubscriptionAdminDetailResponse,
  SubscriptionAdminStatus,
  SubscriptionFrequencyInterval,
} from "../../../types/subscription";

const scheduleableStatuses = new Set<SubscriptionAdminStatus>([
  SubscriptionAdminStatus.ACTIVE,
  SubscriptionAdminStatus.PAUSED,
  SubscriptionAdminStatus.PAST_DUE,
]);

const intervalOptions = [
  { label: "Weekly", value: SubscriptionFrequencyInterval.WEEK },
  { label: "Monthly", value: SubscriptionFrequencyInterval.MONTH },
  { label: "Yearly", value: SubscriptionFrequencyInterval.YEAR },
] as const;
type SubscriptionActionType = "pause" | "resume" | "cancel";

const SubscriptionDetailPage = () => {
  const { id } = useParams();
  const loaderData = useLoaderData() as Awaited<ReturnType<typeof loader>>;
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [variantId, setVariantId] = useState("");
  const [frequencyInterval, setFrequencyInterval] =
    useState<SubscriptionFrequencyInterval>(SubscriptionFrequencyInterval.MONTH);
  const [frequencyValue, setFrequencyValue] = useState("1");
  const [effectiveAt, setEffectiveAt] = useState("");

  const { data, isLoading, isError, error } = useAdminSubscriptionDetailQuery(
    id,
    loaderData,
  );
  const subscription = data?.subscription;

  const {
    data: planOptionsData,
    isLoading: isLoadingPlanOptions,
  } = useAdminSubscriptionPlanOptionsQuery(
    subscription?.product.product_id,
    drawerOpen && Boolean(subscription?.product.product_id),
  );

  const planChangeMutation = useMutation({
    mutationFn: async (body: {
      variant_id: string;
      frequency_interval: SubscriptionFrequencyInterval;
      frequency_value: number;
      effective_at?: string;
    }) =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${id}/schedule-plan-change`,
        {
          method: "POST",
          body,
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminSubscriptionsQueryKeys.all,
      });
      toast.success("Plan change scheduled");
      setDrawerOpen(false);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to schedule plan change",
      );
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${id}/pause`,
        {
          method: "POST",
          body: {},
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminSubscriptionsQueryKeys.all,
      });
      toast.success("Subscription paused");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to pause subscription",
      );
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${id}/resume`,
        {
          method: "POST",
          body: {},
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminSubscriptionsQueryKeys.all,
      });
      toast.success("Subscription resumed");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to resume subscription",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${id}/cancel`,
        {
          method: "POST",
          body: {},
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminSubscriptionsQueryKeys.all,
      });
      toast.success("Subscription cancelled");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to cancel subscription",
      );
    },
  });

  useEffect(() => {
    if (!drawerOpen || !subscription) {
      return;
    }

    setVariantId(
      subscription.pending_update_data?.variant_id ?? subscription.product.variant_id,
    );
    setFrequencyInterval(
      subscription.pending_update_data?.frequency_interval ??
        subscription.frequency.interval,
    );
    setFrequencyValue(
      String(
        subscription.pending_update_data?.frequency_value ??
          subscription.frequency.value,
      ),
    );
    setEffectiveAt(
      toDateTimeLocalValue(subscription.pending_update_data?.effective_at ?? null),
    );
  }, [drawerOpen, subscription]);

  const variantOptions = useMemo(() => {
    return (
      planOptionsData?.variants.map((variant) => ({
        value: variant.id,
        label: [variant.title, variant.sku].filter(Boolean).join(" · "),
      })) ?? []
    );
  }, [planOptionsData]);

  if (isError) {
    throw error;
  }

  if (isLoading || !subscription) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Loading subscription details...
          </Text>
        </div>
      </Container>
    );
  }

  const canSchedulePlanChange = scheduleableStatuses.has(subscription.status);
  const canPause = subscription.status === SubscriptionAdminStatus.ACTIVE;
  const canResume = subscription.status === SubscriptionAdminStatus.PAUSED;
  const canCancel = subscription.status !== SubscriptionAdminStatus.CANCELLED;
  const isActionPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending ||
    planChangeMutation.isPending;

  const handleSubscriptionAction = async (action: SubscriptionActionType) => {
    const confirmed = await prompt(getSubscriptionActionPromptConfig(action));

    if (!confirmed) {
      return;
    }

    switch (action) {
      case "pause":
        await pauseMutation.mutateAsync();
        break;
      case "resume":
        await resumeMutation.mutateAsync();
        break;
      case "cancel":
        await cancelMutation.mutateAsync();
        break;
    }
  };

  const handleSubmit = async () => {
    const parsedFrequencyValue = Number(frequencyValue);

    if (!variantId) {
      toast.error("Select a variant");
      return;
    }

    if (!Number.isInteger(parsedFrequencyValue) || parsedFrequencyValue <= 0) {
      toast.error("Frequency value must be a positive integer");
      return;
    }

    await planChangeMutation.mutateAsync({
      variant_id: variantId,
      frequency_interval: frequencyInterval,
      frequency_value: parsedFrequencyValue,
      effective_at: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between px-6 py-4">
          <div>
            <Heading level="h1">{subscription.reference}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Subscription details and upcoming plan changes.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <StatusBadge
              color={getStatusColor(subscription.status)}
              className="text-nowrap"
            >
              {formatStatus(subscription.status)}
            </StatusBadge>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton size="small" variant="transparent" disabled={isActionPending}>
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {canPause ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => {
                      void handleSubscriptionAction("pause");
                    }}
                  >
                    <Pause className="text-ui-fg-subtle" />
                    <span>{pauseMutation.isPending ? "Pausing..." : "Pause"}</span>
                  </DropdownMenu.Item>
                ) : null}
                {canResume ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => {
                      void handleSubscriptionAction("resume");
                    }}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>{resumeMutation.isPending ? "Resuming..." : "Resume"}</span>
                  </DropdownMenu.Item>
                ) : null}
                {canSchedulePlanChange ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isActionPending}
                    onClick={() => setDrawerOpen(true)}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>Schedule plan change</span>
                  </DropdownMenu.Item>
                ) : null}
                {canCancel ? (
                  <>
                    {(canPause || canResume || canSchedulePlanChange) ? (
                      <DropdownMenu.Separator />
                    ) : null}
                    <DropdownMenu.Item
                      className="flex items-center gap-x-2"
                      disabled={isActionPending}
                      onClick={() => {
                        void handleSubscriptionAction("cancel");
                      }}
                    >
                      <Trash className="text-ui-fg-subtle" />
                      <span>
                        {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
                      </span>
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
          <DetailBlock
            title="Subscription"
            rows={[
              {
                label: "Status",
                value: (
                  <StatusBadge
                    color={getStatusColor(subscription.status)}
                    className="text-nowrap"
                  >
                    {formatStatus(subscription.status)}
                  </StatusBadge>
                ),
              },
              { label: "Frequency", value: subscription.frequency.label },
              { label: "Next renewal", value: formatDateTime(subscription.next_renewal_at) },
              { label: "Started at", value: formatDateTime(subscription.started_at) },
              { label: "Last renewal", value: formatDateTime(subscription.last_renewal_at) },
            ]}
          />
          <DetailBlock
            title="Customer"
            rows={[
              { label: "Name", value: subscription.customer.full_name },
              { label: "Email", value: subscription.customer.email || "-" },
              { label: "Customer ID", value: subscription.customer.id },
            ]}
          />
          <DetailBlock
            title="Product"
            rows={[
              { label: "Product", value: subscription.product.product_title },
              { label: "Variant", value: subscription.product.variant_title },
              { label: "SKU", value: subscription.product.sku || "-" },
            ]}
          />
          <DetailBlock
            title="Shipping address"
            rows={[
              {
                label: "Recipient",
                value: `${subscription.shipping_address.first_name} ${subscription.shipping_address.last_name}`,
              },
              {
                label: "Address",
                value: [
                  subscription.shipping_address.address_1,
                  subscription.shipping_address.address_2,
                ]
                  .filter(Boolean)
                  .join(", "),
              },
              {
                label: "City",
                value: `${subscription.shipping_address.postal_code} ${subscription.shipping_address.city}`,
              },
              {
                label: "Country",
                value: subscription.shipping_address.country_code.toUpperCase(),
              },
              {
                label: "Phone",
                value: subscription.shipping_address.phone || "-",
              },
            ]}
          />
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Pending plan change</Heading>
        </div>
        <div className="px-6 py-4">
          {subscription.pending_update_data ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailRow
                label="Variant"
                value={subscription.pending_update_data.variant_title}
              />
              <DetailRow
                label="Frequency"
                value={formatFrequency(
                  subscription.pending_update_data.frequency_interval,
                  subscription.pending_update_data.frequency_value,
                )}
              />
              <DetailRow
                label="Effective at"
                value={formatDateTime(subscription.pending_update_data.effective_at)}
              />
              <DetailRow
                label="Variant ID"
                value={subscription.pending_update_data.variant_id}
              />
            </div>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              No pending plan change is scheduled for this subscription.
            </Text>
          )}
        </div>
      </Container>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Schedule plan change</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 p-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="variant">Variant</Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <Select.Trigger id="variant">
                    <Select.Value placeholder="Select a variant" />
                  </Select.Trigger>
                  <Select.Content>
                    {variantOptions.map((option) => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
                {isLoadingPlanOptions ? (
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Loading variants...
                  </Text>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="frequency-interval">Frequency interval</Label>
                <Select
                  value={frequencyInterval}
                  onValueChange={(value) =>
                    setFrequencyInterval(value as SubscriptionFrequencyInterval)
                  }
                >
                  <Select.Trigger id="frequency-interval">
                    <Select.Value placeholder="Select interval" />
                  </Select.Trigger>
                  <Select.Content>
                    {intervalOptions.map((option) => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="frequency-value">Frequency value</Label>
                <Input
                  id="frequency-value"
                  type="number"
                  min={1}
                  step={1}
                  value={frequencyValue}
                  onChange={(event) => setFrequencyValue(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="effective-at">Effective at</Label>
                <Input
                  id="effective-at"
                  type="datetime-local"
                  value={effectiveAt}
                  onChange={(event) => setEffectiveAt(event.target.value)}
                />
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  Leave empty to let the backend use the default effective date.
                </Text>
              </div>
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button size="small" variant="secondary" disabled={planChangeMutation.isPending}>
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                onClick={handleSubmit}
                isLoading={planChangeMutation.isPending}
                disabled={planChangeMutation.isPending || isLoadingPlanOptions}
              >
                Save
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  );
};

const DetailBlock = ({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: ReactNode }[];
}) => {
  return (
    <div className="rounded-lg border p-4">
      <Text size="small" leading="compact" weight="plus">
        {title}
      </Text>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <DetailRow key={`${title}-${row.label}`} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => {
  return (
    <div className="grid gap-1">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text size="small" leading="compact" weight="plus">
          {value || "-"}
        </Text>
      ) : (
        value
      )}
    </div>
  );
};

function getStatusColor(status: SubscriptionAdminStatus) {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "green" as const;
    case SubscriptionAdminStatus.PAUSED:
      return "orange" as const;
    case SubscriptionAdminStatus.CANCELLED:
      return "red" as const;
    case SubscriptionAdminStatus.PAST_DUE:
      return "grey" as const;
  }
}

function formatStatus(status: SubscriptionAdminStatus) {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "Active";
    case SubscriptionAdminStatus.PAUSED:
      return "Paused";
    case SubscriptionAdminStatus.CANCELLED:
      return "Cancelled";
    case SubscriptionAdminStatus.PAST_DUE:
      return "Past due";
  }
}

function formatFrequency(
  interval: SubscriptionFrequencyInterval,
  value: number,
) {
  if (value === 1) {
    return `Every ${interval}`;
  }

  return `Every ${value} ${interval}s`;
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

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSubscriptionActionPromptConfig(action: SubscriptionActionType) {
  switch (action) {
    case "pause":
      return {
        title: "Pause subscription?",
        description:
          "You are about to pause this subscription. Do you want to continue?",
        confirmText: "Pause",
        cancelText: "Cancel",
        variant: "confirmation" as const,
      };
    case "resume":
      return {
        title: "Resume subscription?",
        description:
          "You are about to resume this subscription. Do you want to continue?",
        confirmText: "Resume",
        cancelText: "Cancel",
        variant: "confirmation" as const,
      };
    case "cancel":
      return {
        title: "Cancel subscription?",
        description:
          "You are about to cancel this subscription. This action cannot be undone.",
        confirmText: "Cancel subscription",
        cancelText: "Keep subscription",
        variant: "danger" as const,
      };
  }
}

export const handle = {
  breadcrumb: ({ data }: UIMatch<SubscriptionAdminDetailResponse>) =>
    data?.subscription?.reference || "Subscription",
};

export async function loader({ params }: LoaderFunctionArgs) {
  return sdk.client.fetch<SubscriptionAdminDetailResponse>(
    `/admin/subscriptions/${params.id}`,
  );
}

export default SubscriptionDetailPage;
