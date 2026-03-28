import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
  Calendar,
  EllipsisHorizontal,
  Pause,
  TriangleRightMini,
  Trash,
  XMarkMini,
} from "@medusajs/icons";
import {
  Badge,
  Button,
  Container,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTableFilteringState,
  IconButton,
  DataTablePaginationState,
  DataTableSortingState,
  DropdownMenu,
  Heading,
  Text,
  toast,
  useDataTable,
  usePrompt,
} from "@medusajs/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  adminSubscriptionsQueryKeys,
  useAdminSubscriptionsDisplayQuery,
} from "./data-loading";
import { sdk } from "../../lib/client";
import {
  SubscriptionAdminDetailResponse,
  SubscriptionAdminListItem,
  SubscriptionAdminStatus,
} from "../../types/subscription";

const PAGE_SIZE = 20;

const columnHelper = createDataTableColumnHelper<SubscriptionAdminListItem>();
const filterHelper = createDataTableFilterHelper<SubscriptionAdminListItem>();

const statusFilterOptions = [
  { label: "Active", value: SubscriptionAdminStatus.ACTIVE },
  { label: "Paused", value: SubscriptionAdminStatus.PAUSED },
  { label: "Cancelled", value: SubscriptionAdminStatus.CANCELLED },
  { label: "Past due", value: SubscriptionAdminStatus.PAST_DUE },
] as const;

const baseColumns = [
  columnHelper.accessor("reference", {
    header: "Reference",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {getValue()}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.id}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.customer.full_name, {
    id: "customer_name",
    header: "Customer",
    enableSorting: true,
    sortLabel: "Customer",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.customer.full_name}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.customer.email}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.product.product_title, {
    id: "product_title",
    header: "Product",
    enableSorting: true,
    sortLabel: "Product",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.product.product_title}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.product.variant_title}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableSorting: true,
    sortLabel: "Status",
    cell: ({ getValue }) => (
      <Badge color={getStatusColor(getValue())} size="xsmall">
        {formatStatus(getValue())}
      </Badge>
    ),
  }),
  columnHelper.accessor("frequency.label", {
    id: "frequency",
    header: "Frequency",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {getValue()}
        </Text>
        {row.original.discount ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {row.original.discount.label}
          </Text>
        ) : null}
      </div>
    ),
  }),
  columnHelper.accessor("next_renewal_at", {
    header: "Next renewal",
    enableSorting: true,
    sortLabel: "Next renewal",
    cell: ({ getValue, row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {formatDateTime(getValue())}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.skip_next_cycle ? "Next cycle skipped" : "Scheduled"}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("updated_at", {
    header: "Updated",
    enableSorting: true,
    sortLabel: "Updated",
    cell: ({ getValue }) => (
      <Text size="small" leading="compact">
        {formatDateTime(getValue())}
      </Text>
    ),
  }),
];

const statusFilter = filterHelper.accessor("status", {
  type: "multiselect",
  label: "Status",
  options: [...statusFilterOptions],
});

const filters = [statusFilter];

type SubscriptionActionType = "pause" | "resume" | "cancel";

const SubscriptionsPage = () => {
  const [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState<DataTableFilteringState>({});
  const [sorting, setSorting] = useState<DataTableSortingState | null>({
    id: "updated_at",
    desc: true,
  });
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const prompt = usePrompt();
  const queryClient = useQueryClient();

  const statusFilters = useMemo(() => {
    return (filtering.status || []) as SubscriptionAdminStatus[];
  }, [filtering]);

  const activeStatusLabels = useMemo(() => {
    return (
      statusFilterOptions
        .filter((option) => statusFilters.includes(option.value))
        .map((option) => option.label) ?? []
    );
  }, [statusFilters]);

  const { data, isLoading, isError, error } =
    useAdminSubscriptionsDisplayQuery({
      pagination,
      search,
      filtering,
      sorting,
    });

  const pauseMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${subscriptionId}/pause`,
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
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to pause subscription",
      );
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${subscriptionId}/resume`,
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
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to resume subscription",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      sdk.client.fetch<SubscriptionAdminDetailResponse>(
        `/admin/subscriptions/${subscriptionId}/cancel`,
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
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel subscription",
      );
    },
  });

  const pendingActionBySubscriptionId = useMemo(() => {
    const pending = new Map<string, SubscriptionActionType>();

    if (pauseMutation.isPending && pauseMutation.variables) {
      pending.set(pauseMutation.variables, "pause");
    }

    if (resumeMutation.isPending && resumeMutation.variables) {
      pending.set(resumeMutation.variables, "resume");
    }

    if (cancelMutation.isPending && cancelMutation.variables) {
      pending.set(cancelMutation.variables, "cancel");
    }

    return pending;
  }, [
    cancelMutation.isPending,
    cancelMutation.variables,
    pauseMutation.isPending,
    pauseMutation.variables,
    resumeMutation.isPending,
    resumeMutation.variables,
  ]);

  const handleSubscriptionAction = async (
    subscription: SubscriptionAdminListItem,
    action: SubscriptionActionType,
  ) => {
    const confirmed = await prompt(getSubscriptionActionPromptConfig(action));

    if (!confirmed) {
      return;
    }

    switch (action) {
      case "pause":
        await pauseMutation.mutateAsync(subscription.id);
        break;
      case "resume":
        await resumeMutation.mutateAsync(subscription.id);
        break;
      case "cancel":
        await cancelMutation.mutateAsync(subscription.id);
        break;
    }
  };

  const columns = useMemo(
    () => [
      ...baseColumns,
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => {
          const subscription = row.original;
          const pendingAction = pendingActionBySubscriptionId.get(subscription.id);
          const isPending = Boolean(pendingAction);
          const canPause =
            subscription.status === SubscriptionAdminStatus.ACTIVE;
          const canResume =
            subscription.status === SubscriptionAdminStatus.PAUSED;
          const canCancel =
            subscription.status !== SubscriptionAdminStatus.CANCELLED;

          return (
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  size="small"
                  variant="transparent"
                  disabled={isPending}
                >
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {canPause ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSubscriptionAction(subscription, "pause");
                    }}
                  >
                    <Pause className="text-ui-fg-subtle" />
                    <span>{pendingAction === "pause" ? "Pausing..." : "Pause"}</span>
                  </DropdownMenu.Item>
                ) : null}
                {canResume ? (
                  <DropdownMenu.Item
                    className="flex items-center gap-x-2"
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSubscriptionAction(subscription, "resume");
                    }}
                  >
                    <TriangleRightMini className="text-ui-fg-subtle" />
                    <span>{pendingAction === "resume" ? "Resuming..." : "Resume"}</span>
                  </DropdownMenu.Item>
                ) : null}
                {canCancel ? (
                  <>
                    {(canPause || canResume) ? <DropdownMenu.Separator /> : null}
                    <DropdownMenu.Item
                      className="flex items-center gap-x-2"
                      disabled={isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSubscriptionAction(subscription, "cancel");
                      }}
                    >
                      <Trash className="text-ui-fg-subtle" />
                      <span>
                        {pendingAction === "cancel" ? "Cancelling..." : "Cancel"}
                      </span>
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu>
          );
        },
      }),
    ],
    [pendingActionBySubscriptionId],
  );

  const table = useDataTable({
    columns,
    data: data?.subscriptions || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    filters,
    filtering: {
      state: filtering,
      onFilteringChange: setFiltering,
    },
    sorting: {
      state: sorting,
      onSortingChange: setSorting,
    },
    search: {
      state: search,
      onSearchChange: setSearch,
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  });

  if (isError) {
    throw error;
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscriptions</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Monitor subscription status, cadence, and upcoming renewals.
          </Text>
        </div>
        <DataTable instance={table}>
          <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilters.length ? (
                <div className="shadow-buttons-neutral txt-compact-small-plus bg-ui-button-neutral text-ui-fg-base inline-flex items-center overflow-hidden rounded-md">
                  <span className="border-ui-border-base border-r px-3 py-1.5">
                    {statusFilter.label}
                  </span>
                  <span className="border-ui-border-base border-r px-3 py-1.5 text-ui-fg-subtle">
                    is
                  </span>
                  <span className="border-ui-border-base border-r px-3 py-1.5">
                    {activeStatusLabels.join(", ")}
                  </span>
                  <button
                    type="button"
                    className="hover:bg-ui-button-neutral-hover px-2 py-1.5 transition-fg"
                    onClick={() => {
                      setFiltering((current) => {
                        const { status, ...rest } = current;

                        return rest;
                      });
                    }}
                  >
                    <XMarkMini />
                  </button>
                </div>
              ) : null}
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <Button size="small" variant="secondary" type="button">
                    Add filter
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start">
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {statusFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {statusFilterOptions.map((option) => {
                        const checked = statusFilters.includes(option.value);

                        return (
                          <DropdownMenu.CheckboxItem
                            key={option.value}
                            checked={checked}
                            onSelect={(event) => {
                              event.preventDefault();
                            }}
                            onCheckedChange={(nextChecked) => {
                              const value = option.value;

                              setFiltering((current) => {
                                const currentValues = Array.isArray(
                                  current.status,
                                )
                                  ? (current.status as SubscriptionAdminStatus[])
                                  : [];

                                const nextValues = nextChecked
                                  ? currentValues.includes(value)
                                    ? currentValues
                                    : [...currentValues, value]
                                  : currentValues.filter(
                                      (currentValue) => currentValue !== value,
                                    );

                                if (!nextValues.length) {
                                  const { status, ...rest } = current;

                                  return rest;
                                }

                                return {
                                  ...current,
                                  status: nextValues,
                                };
                              });
                            }}
                          >
                            {option.label}
                          </DropdownMenu.CheckboxItem>
                        );
                      })}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  {statusFilters.length ? (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        onSelect={(event) => {
                          event.preventDefault();
                          setFiltering((current) => {
                            const { status, ...rest } = current;

                            return rest;
                          });
                        }}
                      >
                        Clear status filter
                      </DropdownMenu.Item>
                    </>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu>
              {statusFilters.length ? (
                <button
                  type="button"
                  className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small-plus rounded-md px-2 py-1 transition-fg"
                  onClick={() => {
                    setFiltering((current) => {
                      const { status, ...rest } = current;

                      return rest;
                    });
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-x-2 self-end md:self-auto">
              <div className="w-full md:w-auto">
                <DataTable.Search placeholder="Search" />
              </div>
              <DataTable.SortingMenu />
            </div>
          </div>
          <DataTable.Table
            emptyState={{
              empty: {
                heading: "No subscriptions yet",
                description:
                  "Subscriptions will appear here once customers start recurring orders.",
              },
              filtered: {
                heading: "No matching subscriptions",
                description: "Try changing the search term or active filters.",
              },
            }}
          />
          <DataTable.Pagination />
        </DataTable>
      </Container>
      <Container className="divide-y p-0"></Container>
    </div>
  );
};

function getStatusColor(status: SubscriptionAdminStatus) {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "green";
    case SubscriptionAdminStatus.PAUSED:
      return "orange";
    case SubscriptionAdminStatus.CANCELLED:
      return "red";
    case SubscriptionAdminStatus.PAST_DUE:
      return "grey";
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const config = defineRouteConfig({
  label: "Subscriptions",
  icon: Calendar,
});

export default SubscriptionsPage;

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
