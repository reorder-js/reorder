import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
  Calendar,
  Pause,
  TriangleRightMini,
  Trash,
  XMarkMini,
} from "@medusajs/icons";
import {
  Button,
  Container,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTableFilteringState,
  DataTablePaginationState,
  DataTableSortingState,
  DropdownMenu,
  Heading,
  StatusBadge,
  Text,
  toast,
  useDataTable,
  usePrompt,
} from "@medusajs/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const booleanFilterOptions = [
  { label: "Yes", value: true },
  { label: "No", value: false },
] as const;

const nextRenewalFilterOptions = [
  { label: "Overdue", value: "overdue" },
  { label: "Next 7 days", value: "next_7_days" },
  { label: "Next 30 days", value: "next_30_days" },
  { label: "Next 90 days", value: "next_90_days" },
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
      <StatusBadge color={getStatusColor(getValue())} className="text-nowrap">
        {formatStatus(getValue())}
      </StatusBadge>
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

const trialFilter = filterHelper.accessor("trial.is_trial", {
  id: "is_trial",
  type: "radio",
  label: "Trial",
  options: [...booleanFilterOptions],
});

const skipNextCycleFilter = filterHelper.accessor("skip_next_cycle", {
  type: "radio",
  label: "Skip next cycle",
  options: [...booleanFilterOptions],
});

const nextRenewalFilter = filterHelper.accessor("next_renewal_at", {
  id: "next_renewal",
  type: "radio",
  label: "Next renewal",
  options: [...nextRenewalFilterOptions],
});

const filters = [
  statusFilter,
  trialFilter,
  skipNextCycleFilter,
  nextRenewalFilter,
];

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
  const navigate = useNavigate();

  const statusFilters = useMemo(() => {
    return (filtering.status || []) as SubscriptionAdminStatus[];
  }, [filtering]);
  const trialFilterValue = useMemo(() => {
    return typeof filtering.is_trial === "boolean"
      ? filtering.is_trial
      : undefined;
  }, [filtering]);
  const skipNextCycleFilterValue = useMemo(() => {
    return typeof filtering.skip_next_cycle === "boolean"
      ? filtering.skip_next_cycle
      : undefined;
  }, [filtering]);
  const nextRenewalFilterValue = useMemo(() => {
    return typeof filtering.next_renewal === "string"
      ? filtering.next_renewal
      : undefined;
  }, [filtering]);

  const activeStatusLabels = useMemo(() => {
    return (
      statusFilterOptions
        .filter((option) => statusFilters.includes(option.value))
        .map((option) => option.label) ?? []
    );
  }, [statusFilters]);
  const activeTrialLabel = useMemo(() => {
    return booleanFilterOptions.find((option) => option.value === trialFilterValue)
      ?.label;
  }, [trialFilterValue]);
  const activeSkipNextCycleLabel = useMemo(() => {
    return booleanFilterOptions.find(
      (option) => option.value === skipNextCycleFilterValue,
    )?.label;
  }, [skipNextCycleFilterValue]);
  const activeNextRenewalLabel = useMemo(() => {
    return nextRenewalFilterOptions.find(
      (option) => option.value === nextRenewalFilterValue,
    )?.label;
  }, [nextRenewalFilterValue]);
  const hasActiveFilters =
    statusFilters.length ||
    typeof trialFilterValue === "boolean" ||
    typeof skipNextCycleFilterValue === "boolean" ||
    Boolean(nextRenewalFilterValue);

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
      columnHelper.action({
        actions: ({ row }) => {
          const subscription = row.original;
          const pendingAction = pendingActionBySubscriptionId.get(subscription.id);
          const isPending = Boolean(pendingAction);
          const canPause =
            subscription.status === SubscriptionAdminStatus.ACTIVE;
          const canResume =
            subscription.status === SubscriptionAdminStatus.PAUSED;
          const canCancel =
            subscription.status !== SubscriptionAdminStatus.CANCELLED;

          const actionGroups = [
            canPause
              ? [
                  {
                    label: pendingAction === "pause" ? "Pausing..." : "Pause",
                    icon: <Pause />,
                    onClick: () => {
                      void handleSubscriptionAction(subscription, "pause");
                    },
                  },
                ]
              : [],
            canResume
              ? [
                  {
                    label: pendingAction === "resume" ? "Resuming..." : "Resume",
                    icon: <TriangleRightMini />,
                    onClick: () => {
                      void handleSubscriptionAction(subscription, "resume");
                    },
                  },
                ]
              : [],
            canCancel
              ? [
                  {
                    label:
                      pendingAction === "cancel" ? "Cancelling..." : "Cancel",
                    icon: <Trash />,
                    onClick: () => {
                      void handleSubscriptionAction(subscription, "cancel");
                    },
                  },
                ]
              : [],
          ].filter((group) => group.length);

          return actionGroups.map((group) =>
            group.map((action) => ({
              ...action,
              icon: (
                <span className="text-ui-fg-subtle [&_svg]:text-ui-fg-subtle">
                  {action.icon}
                </span>
              ),
              onClick: () => {
                if (isPending) {
                  return;
                }

                action.onClick();
              },
            })),
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
    onRowClick: (_event, row) => {
      navigate(`/subscriptions/${row.id}`);
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
                <FilterChip
                  label={statusFilter.label}
                  value={activeStatusLabels.join(", ")}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "status"));
                  }}
                />
              ) : null}
              {activeTrialLabel ? (
                <FilterChip
                  label={trialFilter.label}
                  value={activeTrialLabel}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "is_trial"));
                  }}
                />
              ) : null}
              {activeSkipNextCycleLabel ? (
                <FilterChip
                  label={skipNextCycleFilter.label}
                  value={activeSkipNextCycleLabel}
                  onRemove={() => {
                    setFiltering((current) =>
                      removeFilter(current, "skip_next_cycle"),
                    );
                  }}
                />
              ) : null}
              {activeNextRenewalLabel ? (
                <FilterChip
                  label={nextRenewalFilter.label}
                  value={activeNextRenewalLabel}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "next_renewal"));
                  }}
                />
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
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {trialFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {booleanFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={`trial-${String(option.value)}`}
                          checked={trialFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(nextChecked) => {
                            setFiltering((current) => {
                              if (!nextChecked) {
                                return removeFilter(current, "is_trial");
                              }

                              return {
                                ...current,
                                is_trial: option.value,
                              };
                            });
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {skipNextCycleFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {booleanFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={`skip-next-cycle-${String(option.value)}`}
                          checked={skipNextCycleFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(nextChecked) => {
                            setFiltering((current) => {
                              if (!nextChecked) {
                                return removeFilter(current, "skip_next_cycle");
                              }

                              return {
                                ...current,
                                skip_next_cycle: option.value,
                              };
                            });
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {nextRenewalFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {nextRenewalFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={option.value}
                          checked={nextRenewalFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(nextChecked) => {
                            setFiltering((current) => {
                              if (!nextChecked) {
                                return removeFilter(current, "next_renewal");
                              }

                              return {
                                ...current,
                                next_renewal: option.value,
                              };
                            });
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  {hasActiveFilters ? (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        onSelect={(event) => {
                          event.preventDefault();
                          setFiltering({});
                        }}
                      >
                        Clear all filters
                      </DropdownMenu.Item>
                    </>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small-plus rounded-md px-2 py-1 transition-fg"
                  onClick={() => {
                    setFiltering({});
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

export const handle = {
  breadcrumb: () => "Subscriptions",
};

export default SubscriptionsPage;

const FilterChip = ({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) => {
  return (
    <div className="shadow-buttons-neutral txt-compact-small-plus bg-ui-button-neutral text-ui-fg-base inline-flex items-center overflow-hidden rounded-md">
      <span className="border-ui-border-base border-r px-3 py-1.5">{label}</span>
      <span className="border-ui-border-base border-r px-3 py-1.5 text-ui-fg-subtle">
        is
      </span>
      <span className="border-ui-border-base border-r px-3 py-1.5">{value}</span>
      <button
        type="button"
        className="hover:bg-ui-button-neutral-hover px-2 py-1.5 transition-fg"
        onClick={onRemove}
      >
        <XMarkMini />
      </button>
    </div>
  );
};

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

function removeFilter(
  current: DataTableFilteringState,
  key: string,
) {
  const { [key]: _removed, ...rest } = current;

  return rest;
}
