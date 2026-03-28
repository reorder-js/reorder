import {
  Alert,
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
  PencilSquare,
  Spinner,
  TriangleRightMini,
  Trash,
} from "@medusajs/icons";
import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
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
  SubscriptionAdminShippingAddress,
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
type ShippingAddressFormState = {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postal_code: string;
  province: string;
  country_code: string;
  phone: string;
};

const SubscriptionDetailPage = () => {
  const { id } = useParams();
  const loaderData = useLoaderData() as Awaited<ReturnType<typeof loader>>;
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [shippingDrawerOpen, setShippingDrawerOpen] = useState(false);
  const [variantId, setVariantId] = useState("");
  const [frequencyInterval, setFrequencyInterval] =
    useState<SubscriptionFrequencyInterval>(SubscriptionFrequencyInterval.MONTH);
  const [frequencyValue, setFrequencyValue] = useState("1");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [shippingAddressForm, setShippingAddressForm] =
    useState<ShippingAddressFormState>(getEmptyShippingAddressFormState());

  const { data, isLoading, isError, error } = useAdminSubscriptionDetailQuery(
    id,
    loaderData,
  );
  const subscription = data?.subscription;

  const {
    data: planOptionsData,
    isLoading: isLoadingPlanOptions,
    isError: isPlanOptionsError,
    error: planOptionsError,
  } = useAdminSubscriptionPlanOptionsQuery(
    subscription?.product.product_id,
    planDrawerOpen && Boolean(subscription?.product.product_id),
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
      await invalidateSubscriptionQueries(queryClient, id);
      toast.success("Plan change scheduled");
      setPlanDrawerOpen(false);
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
      await invalidateSubscriptionQueries(queryClient, id);
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
      await invalidateSubscriptionQueries(queryClient, id);
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
      await invalidateSubscriptionQueries(queryClient, id);
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

  const updateShippingAddressMutation = useMutation({
    mutationFn: async (body: SubscriptionAdminShippingAddress) =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${id}/update-shipping-address`,
        {
          method: "POST",
          body,
        },
      ),
    onSuccess: async () => {
      await invalidateSubscriptionQueries(queryClient, id);
      toast.success("Shipping address updated");
      setShippingDrawerOpen(false);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update shipping address",
      );
    },
  });

  useEffect(() => {
    if (!planDrawerOpen || !subscription) {
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
  }, [planDrawerOpen, subscription]);

  useEffect(() => {
    if (!shippingDrawerOpen || !subscription) {
      return;
    }

    setShippingAddressForm(
      getShippingAddressFormState(subscription.shipping_address),
    );
  }, [shippingDrawerOpen, subscription]);

  const variantOptions = useMemo(() => {
    return (
      planOptionsData?.variants.map((variant) => ({
        value: variant.id,
        label: [variant.title, variant.sku].filter(Boolean).join(" · "),
      })) ?? []
    );
  }, [planOptionsData]);

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription</Heading>
        </div>
        <div className="flex items-center gap-x-2 px-6 py-6 text-ui-fg-subtle">
          <Spinner className="animate-spin" />
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Loading subscription details...
          </Text>
        </div>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error
              ? error.message
              : "Failed to load subscription details."}
          </Alert>
        </div>
      </Container>
    );
  }

  if (!subscription) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription</Heading>
        </div>
        <div className="px-6 py-6">
          <Alert variant="warning">Subscription details are unavailable.</Alert>
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
    planChangeMutation.isPending ||
    updateShippingAddressMutation.isPending;

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

  const handleShippingAddressChange = <
    TField extends keyof ShippingAddressFormState,
  >(
    field: TField,
    value: ShippingAddressFormState[TField],
  ) => {
    setShippingAddressForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleShippingAddressSubmit = async () => {
    const body = {
      first_name: shippingAddressForm.first_name.trim(),
      last_name: shippingAddressForm.last_name.trim(),
      company: normalizeOptionalString(shippingAddressForm.company),
      address_1: shippingAddressForm.address_1.trim(),
      address_2: normalizeOptionalString(shippingAddressForm.address_2),
      city: shippingAddressForm.city.trim(),
      postal_code: shippingAddressForm.postal_code.trim(),
      province: normalizeOptionalString(shippingAddressForm.province),
      country_code: shippingAddressForm.country_code.trim().toLowerCase(),
      phone: normalizeOptionalString(shippingAddressForm.phone),
    };

    if (!body.first_name || !body.last_name || !body.address_1 || !body.city) {
      toast.error("Fill in all required address fields");
      return;
    }

    if (!body.postal_code || body.country_code.length !== 2) {
      toast.error("Enter a valid postal code and 2-letter country code");
      return;
    }

    await updateShippingAddressMutation.mutateAsync(body);
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
                    onClick={() => setPlanDrawerOpen(true)}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>Schedule plan change</span>
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Item
                  className="flex items-center gap-x-2"
                  disabled={isActionPending}
                  onClick={() => setShippingDrawerOpen(true)}
                >
                  <PencilSquare className="text-ui-fg-subtle" />
                  <span>Edit shipping address</span>
                </DropdownMenu.Item>
                {canCancel ? (
                  <>
                    <DropdownMenu.Separator />
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

      <Drawer open={planDrawerOpen} onOpenChange={setPlanDrawerOpen}>
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
                  <div className="flex items-center gap-x-2 text-ui-fg-subtle">
                    <Spinner className="animate-spin" />
                    <Text size="small" leading="compact" className="text-ui-fg-subtle">
                      Loading variants...
                    </Text>
                  </div>
                ) : null}
                {isPlanOptionsError ? (
                  <Alert variant="error">
                    {planOptionsError instanceof Error
                      ? planOptionsError.message
                      : "Failed to load product variants."}
                  </Alert>
                ) : null}
                {!isLoadingPlanOptions && !isPlanOptionsError && !variantOptions.length ? (
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    No variants are available for this product.
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
                disabled={
                  planChangeMutation.isPending ||
                  isLoadingPlanOptions ||
                  isPlanOptionsError ||
                  !variantOptions.length
                }
              >
                Save
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Drawer open={shippingDrawerOpen} onOpenChange={setShippingDrawerOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit shipping address</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 p-4">
            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input
                    id="first-name"
                    value={shippingAddressForm.first_name}
                    onChange={(event) =>
                      handleShippingAddressChange("first_name", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input
                    id="last-name"
                    value={shippingAddressForm.last_name}
                    onChange={(event) =>
                      handleShippingAddressChange("last_name", event.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={shippingAddressForm.company}
                  onChange={(event) =>
                    handleShippingAddressChange("company", event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address-1">Address line 1</Label>
                <Input
                  id="address-1"
                  value={shippingAddressForm.address_1}
                  onChange={(event) =>
                    handleShippingAddressChange("address_1", event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address-2">Address line 2</Label>
                <Input
                  id="address-2"
                  value={shippingAddressForm.address_2}
                  onChange={(event) =>
                    handleShippingAddressChange("address_2", event.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={shippingAddressForm.city}
                    onChange={(event) =>
                      handleShippingAddressChange("city", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postal-code">Postal code</Label>
                  <Input
                    id="postal-code"
                    value={shippingAddressForm.postal_code}
                    onChange={(event) =>
                      handleShippingAddressChange("postal_code", event.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="province">Province / State</Label>
                  <Input
                    id="province"
                    value={shippingAddressForm.province}
                    onChange={(event) =>
                      handleShippingAddressChange("province", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country-code">Country code</Label>
                  <Input
                    id="country-code"
                    maxLength={2}
                    value={shippingAddressForm.country_code}
                    onChange={(event) =>
                      handleShippingAddressChange("country_code", event.target.value)
                    }
                  />
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Use the two-letter ISO country code, for example PL or US.
                  </Text>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={shippingAddressForm.phone}
                  onChange={(event) =>
                    handleShippingAddressChange("phone", event.target.value)
                  }
                />
              </div>
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={updateShippingAddressMutation.isPending}
                >
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                onClick={handleShippingAddressSubmit}
                isLoading={updateShippingAddressMutation.isPending}
                disabled={updateShippingAddressMutation.isPending}
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

async function invalidateSubscriptionQueries(
  queryClient: QueryClient,
  id?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminSubscriptionsQueryKeys.all,
    }),
    ...(id
      ? [
          queryClient.invalidateQueries({
            queryKey: adminSubscriptionsQueryKeys.detail(id),
          }),
        ]
      : []),
  ]);
}

function getShippingAddressFormState(
  address: SubscriptionAdminShippingAddress,
): ShippingAddressFormState {
  return {
    first_name: address.first_name,
    last_name: address.last_name,
    company: address.company ?? "",
    address_1: address.address_1,
    address_2: address.address_2 ?? "",
    city: address.city,
    postal_code: address.postal_code,
    province: address.province ?? "",
    country_code: address.country_code.toUpperCase(),
    phone: address.phone ?? "",
  };
}

function getEmptyShippingAddressFormState(): ShippingAddressFormState {
  return {
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    postal_code: "",
    province: "",
    country_code: "",
    phone: "",
  };
}

function normalizeOptionalString(value: string) {
  const normalized = value.trim();

  return normalized ? normalized : null;
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
