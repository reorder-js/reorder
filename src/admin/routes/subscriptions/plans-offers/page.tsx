import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
  CheckCircle,
  Pause,
  PencilSquare,
  Plus,
  XMarkMini,
} from "@medusajs/icons";
import {
  Alert,
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
import { Link } from "react-router-dom";
import { sdk } from "../../../lib/client";
import {
  adminPlanOffersQueryKeys,
  useAdminPlanOffersDisplayQuery,
} from "./data-loading";
import {
  PlanOfferAdminDetailResponse,
  PlanOfferAdminListItem,
  PlanOfferAdminStatus,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
} from "../../../types/plan-offer";
import { CreatePlanOfferModal } from "./components/create-plan-offer-modal";
import { EditPlanOfferDrawer } from "./components/edit-plan-offer-drawer";
import {
  PlanOfferProductPickerModal,
  PlanOfferVariantPickerModal,
} from "./components/selection-modals";

const PAGE_SIZE = 20;

const columnHelper = createDataTableColumnHelper<PlanOfferAdminListItem>();
const filterHelper = createDataTableFilterHelper<PlanOfferAdminListItem>();

const statusFilterOptions = [
  { label: "Enabled", value: PlanOfferAdminStatus.ENABLED },
  { label: "Disabled", value: PlanOfferAdminStatus.DISABLED },
] as const;

const scopeFilterOptions = [
  { label: "Product", value: PlanOfferScope.PRODUCT },
  { label: "Variant", value: PlanOfferScope.VARIANT },
] as const;

const frequencyFilterOptions = [
  { label: "Weekly", value: PlanOfferFrequencyInterval.WEEK },
  { label: "Monthly", value: PlanOfferFrequencyInterval.MONTH },
  { label: "Yearly", value: PlanOfferFrequencyInterval.YEAR },
] as const;

const discountRangeFilterOptions = [
  { label: "1-9", min: 1, max: 9 },
  { label: "10-24", min: 10, max: 24 },
  { label: "25+", min: 25 },
] as const;

const statusFilter = filterHelper.accessor("status", {
  type: "radio",
  label: "Status",
  options: [...statusFilterOptions],
});

const scopeFilter = filterHelper.accessor("target.scope", {
  id: "scope",
  type: "radio",
  label: "Scope",
  options: [...scopeFilterOptions],
});

const frequencyFilter = filterHelper.accessor("allowed_frequencies", {
  id: "frequency",
  type: "radio",
  label: "Frequency",
  options: [...frequencyFilterOptions],
});

const filters = [statusFilter, scopeFilter, frequencyFilter];

const baseColumns = [
  columnHelper.accessor("name", {
    header: "Name",
    enableSorting: true,
    sortLabel: "Name",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.name}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.id}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("target.product_title", {
    id: "product_title",
    header: "Target",
    enableSorting: true,
    sortLabel: "Product",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus">
          {row.original.target.product_title}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {row.original.target.scope === PlanOfferScope.PRODUCT
            ? "All variants"
            : [row.original.target.variant_title, row.original.target.sku]
                .filter(Boolean)
                .join(" · ")}
        </Text>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableSorting: true,
    sortLabel: "Status",
    cell: ({ getValue }) => (
      <StatusBadge
        color={
          getValue() === PlanOfferAdminStatus.ENABLED ? "green" : "grey"
        }
        className="text-nowrap"
      >
        {getValue() === PlanOfferAdminStatus.ENABLED ? "Enabled" : "Disabled"}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("allowed_frequencies", {
    id: "frequencies",
    header: "Frequencies",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-1">
        {row.original.allowed_frequencies.length ? (
          row.original.allowed_frequencies.slice(0, 2).map((frequency) => (
            <Text key={frequency.label} size="small" leading="compact">
              {frequency.label}
            </Text>
          ))
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            -
          </Text>
        )}
        {row.original.allowed_frequencies.length > 2 ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            +{row.original.allowed_frequencies.length - 2} more
          </Text>
        ) : null}
      </div>
    ),
  }),
  columnHelper.accessor("effective_config_summary.source_scope", {
    id: "effective_source",
    header: "Effective source",
    cell: ({ row }) => (
      <Text size="small" leading="compact">
        {formatEffectiveSource(row.original)}
      </Text>
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

const PlansOffersPage = () => {
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editPlanOfferId, setEditPlanOfferId] = useState<string>();
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const prompt = usePrompt();
  const queryClient = useQueryClient();

  const statusFilterValue = useMemo(() => {
    return typeof filtering.status === "string"
      ? (filtering.status as PlanOfferAdminStatus)
      : undefined;
  }, [filtering]);

  const scopeFilterValue = useMemo(() => {
    return typeof filtering.scope === "string"
      ? (filtering.scope as PlanOfferScope)
      : undefined;
  }, [filtering]);

  const frequencyFilterValue = useMemo(() => {
    return typeof filtering.frequency === "string"
      ? (filtering.frequency as PlanOfferFrequencyInterval)
      : undefined;
  }, [filtering]);
  const productIdFilterValue = useMemo(() => {
    return typeof filtering.product_id === "string"
      ? filtering.product_id
      : undefined;
  }, [filtering]);
  const productTitleFilterValue = useMemo(() => {
    return typeof filtering.product_title === "string"
      ? filtering.product_title
      : undefined;
  }, [filtering]);
  const variantIdFilterValue = useMemo(() => {
    return typeof filtering.variant_id === "string"
      ? filtering.variant_id
      : undefined;
  }, [filtering]);
  const variantTitleFilterValue = useMemo(() => {
    return typeof filtering.variant_title === "string"
      ? filtering.variant_title
      : undefined;
  }, [filtering]);
  const discountMinFilterValue = useMemo(() => {
    return typeof filtering.discount_min === "number"
      ? filtering.discount_min
      : undefined;
  }, [filtering]);
  const discountMaxFilterValue = useMemo(() => {
    return typeof filtering.discount_max === "number"
      ? filtering.discount_max
      : undefined;
  }, [filtering]);

  const { data, isLoading, isError, error } = useAdminPlanOffersDisplayQuery({
    pagination,
    search,
    filtering,
    sorting,
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { id: string; is_enabled: boolean }) =>
      sdk.client.fetch<PlanOfferAdminDetailResponse>(
        `/admin/subscription-offers/${input.id}/toggle`,
        {
          method: "POST",
          body: {
            is_enabled: input.is_enabled,
          },
        }
      ),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminPlanOffersQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminPlanOffersQueryKeys.detail(variables.id),
        }),
      ]);
      toast.success(
        variables.is_enabled ? "Plan offer enabled" : "Plan offer disabled"
      );
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update plan offer"
      );
    },
  });

  const pendingToggleId = toggleMutation.isPending
    ? toggleMutation.variables?.id
    : undefined;

  const selectedProduct = useMemo(() => {
    if (!productIdFilterValue || !productTitleFilterValue) {
      return null;
    }

    return {
      id: productIdFilterValue,
      title: productTitleFilterValue,
    };
  }, [productIdFilterValue, productTitleFilterValue]);

  const selectedVariant = useMemo(() => {
    if (!variantIdFilterValue || !variantTitleFilterValue) {
      return null;
    }

    return {
      id: variantIdFilterValue,
      title: variantTitleFilterValue,
    };
  }, [variantIdFilterValue, variantTitleFilterValue]);

  const handleToggle = async (planOffer: PlanOfferAdminListItem) => {
    const nextEnabled = !planOffer.is_enabled;
    const confirmed = await prompt({
      title: nextEnabled ? "Enable plan offer?" : "Disable plan offer?",
      description: nextEnabled
        ? "You are about to enable this plan offer. Do you want to continue?"
        : "You are about to disable this plan offer. Do you want to continue?",
      confirmText: nextEnabled ? "Enable" : "Disable",
      cancelText: "Cancel",
    });

    if (!confirmed) {
      return;
    }

    await toggleMutation.mutateAsync({
      id: planOffer.id,
      is_enabled: nextEnabled,
    });
  };

  const columns = useMemo(
    () => [
      ...baseColumns,
      columnHelper.action({
        actions: ({ row }) => {
          const planOffer = row.original;
          const isPending = pendingToggleId === planOffer.id;

          return [
            [
              {
                label: "Edit",
                icon: <PencilSquare />,
                onClick: () => {
                  setEditPlanOfferId(planOffer.id);
                  setEditDrawerOpen(true);
                },
              },
              {
                label:
                  isPending
                    ? planOffer.is_enabled
                      ? "Disabling..."
                      : "Enabling..."
                    : planOffer.is_enabled
                      ? "Disable"
                      : "Enable",
                icon: planOffer.is_enabled ? <Pause /> : <CheckCircle />,
                onClick: () => {
                  if (isPending) {
                    return;
                  }

                  void handleToggle(planOffer);
                },
              },
            ],
          ];
        },
      }),
    ],
    [pendingToggleId]
  );

  const table = useDataTable({
    columns,
    data: data?.plan_offers || [],
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
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <div className="flex flex-col gap-y-3">
            <div className="flex items-center justify-between gap-x-4">
              <div className="flex flex-col">
                <Heading level="h1">Plans & Offers</Heading>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  Configure product-level and variant-level subscription offers.
                </Text>
              </div>
              <Button asChild size="small" variant="secondary" type="button">
                <Link to="/subscriptions">Back to Subscriptions</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <Alert variant="error">
            {error instanceof Error
              ? error.message
              : "Failed to load plan offers."}
          </Alert>
        </div>
      </Container>
    );
  }

  const hasActiveFilters =
    Boolean(statusFilterValue) ||
    Boolean(scopeFilterValue) ||
    Boolean(frequencyFilterValue) ||
    Boolean(selectedProduct) ||
    Boolean(selectedVariant) ||
    typeof discountMinFilterValue === "number" ||
    typeof discountMaxFilterValue === "number";

  return (
    <div className="flex flex-col gap-y-4">
      <PlanOfferProductPickerModal
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        selectedProductId={selectedProduct?.id}
        onSelect={(product) => {
          setFiltering((current) => ({
            ...removeFilter(removeFilter(current, "variant_id"), "variant_title"),
            product_id: product.id,
            product_title: product.title,
          }));
        }}
      />
      <PlanOfferVariantPickerModal
        open={variantPickerOpen}
        onOpenChange={setVariantPickerOpen}
        productId={selectedProduct?.id}
        productTitle={selectedProduct?.title}
        selectedVariantId={selectedVariant?.id}
        onSelect={(variant) => {
          setFiltering((current) => ({
            ...current,
            variant_id: variant.id,
            variant_title: variant.title,
          }));
        }}
      />
      <CreatePlanOfferModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
      <EditPlanOfferDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        planOfferId={editPlanOfferId}
      />

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Subscription management
            </Text>
            <Heading level="h1">Plans & Offers</Heading>
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle"
            >
              Configure product-level and variant-level subscription offers.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Button asChild size="small" variant="secondary" type="button">
              <Link to="/subscriptions">View Subscriptions</Link>
            </Button>
            <Button
              size="small"
              type="button"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus />
              Create
            </Button>
          </div>
        </div>
        <DataTable instance={table}>
          <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilterValue ? (
                <FilterChip
                  label={statusFilter.label}
                  value={formatStatusFilter(statusFilterValue)}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "status"));
                  }}
                />
              ) : null}
              {scopeFilterValue ? (
                <FilterChip
                  label={scopeFilter.label}
                  value={formatScope(scopeFilterValue)}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "scope"));
                  }}
                />
              ) : null}
              {frequencyFilterValue ? (
                <FilterChip
                  label={frequencyFilter.label}
                  value={formatFrequencyFilter(frequencyFilterValue)}
                  onRemove={() => {
                    setFiltering((current) => removeFilter(current, "frequency"));
                  }}
                />
              ) : null}
              {selectedProduct ? (
                <FilterChip
                  label="Product"
                  value={selectedProduct.title}
                  onRemove={() => {
                    setFiltering((current) => {
                      const next = removeFilter(
                        removeFilter(
                          removeFilter(removeFilter(current, "product_id"), "product_title"),
                          "variant_id"
                        ),
                        "variant_title"
                      );

                      return next;
                    });
                    setVariantRowSelection({});
                  }}
                />
              ) : null}
              {selectedVariant ? (
                <FilterChip
                  label="Variant"
                  value={selectedVariant.title}
                  onRemove={() => {
                    setFiltering((current) =>
                      removeFilter(removeFilter(current, "variant_id"), "variant_title")
                    );
                  }}
                />
              ) : null}
              {typeof discountMinFilterValue === "number" ||
              typeof discountMaxFilterValue === "number" ? (
                <FilterChip
                  label="Discount"
                  value={formatDiscountRange(discountMinFilterValue, discountMaxFilterValue)}
                  onRemove={() => {
                    setFiltering((current) =>
                      removeFilter(removeFilter(current, "discount_min"), "discount_max")
                    );
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
                      {statusFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={option.value}
                          checked={statusFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(checked) => {
                            setFiltering((current) =>
                              checked
                                ? {
                                    ...current,
                                    status: option.value,
                                  }
                                : removeFilter(current, "status")
                            );
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {scopeFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {scopeFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={option.value}
                          checked={scopeFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(checked) => {
                            setFiltering((current) =>
                              checked
                                ? {
                                    ...current,
                                    scope: option.value,
                                  }
                                : removeFilter(current, "scope")
                            );
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      {frequencyFilter.label}
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {frequencyFilterOptions.map((option) => (
                        <DropdownMenu.CheckboxItem
                          key={option.value}
                          checked={frequencyFilterValue === option.value}
                          onSelect={(event) => {
                            event.preventDefault();
                          }}
                          onCheckedChange={(checked) => {
                            setFiltering((current) =>
                              checked
                                ? {
                                    ...current,
                                    frequency: option.value,
                                  }
                                : removeFilter(current, "frequency")
                            );
                          }}
                        >
                          {option.label}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.SubMenu>
                    <DropdownMenu.SubMenuTrigger>
                      Discount range
                    </DropdownMenu.SubMenuTrigger>
                    <DropdownMenu.SubMenuContent>
                      {discountRangeFilterOptions.map((option) => {
                        const checked =
                          discountMinFilterValue === option.min &&
                          discountMaxFilterValue === option.max;

                        return (
                          <DropdownMenu.CheckboxItem
                            key={option.label}
                            checked={checked}
                            onSelect={(event) => {
                              event.preventDefault();
                            }}
                            onCheckedChange={(isChecked) => {
                              setFiltering((current) =>
                                isChecked
                                  ? {
                                      ...current,
                                      discount_min: option.min,
                                      discount_max: option.max,
                                    }
                                  : removeFilter(
                                      removeFilter(current, "discount_min"),
                                      "discount_max"
                                    )
                              );
                            }}
                          >
                            {option.label}
                          </DropdownMenu.CheckboxItem>
                        );
                      })}
                    </DropdownMenu.SubMenuContent>
                  </DropdownMenu.SubMenu>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onClick={() => {
                      setProductPickerOpen(true);
                    }}
                  >
                    Product
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    disabled={!selectedProduct}
                    onClick={() => {
                      if (!selectedProduct) {
                        return;
                      }

                      setVariantPickerOpen(true);
                    }}
                  >
                    Variant
                  </DropdownMenu.Item>
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
                heading: "No plan offers yet",
                description:
                  "Create a product-level or variant-level subscription offer to get started.",
              },
              filtered: {
                heading: "No matching plan offers",
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

export const config = defineRouteConfig({
  label: "Plans & Offers",
  rank: 1,
});

export const handle = {
  breadcrumb: () => "Plans & Offers",
};

export default PlansOffersPage;

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

function removeFilter(
  current: DataTableFilteringState,
  key: string
): DataTableFilteringState {
  const { [key]: _removed, ...rest } = current;
  return rest;
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

function formatScope(scope: PlanOfferScope) {
  return scope === PlanOfferScope.PRODUCT ? "Product" : "Variant";
}

function formatStatusFilter(status: PlanOfferAdminStatus) {
  return status === PlanOfferAdminStatus.ENABLED ? "Enabled" : "Disabled";
}

function formatFrequencyFilter(frequency: PlanOfferFrequencyInterval) {
  switch (frequency) {
    case PlanOfferFrequencyInterval.WEEK:
      return "Weekly";
    case PlanOfferFrequencyInterval.MONTH:
      return "Monthly";
    case PlanOfferFrequencyInterval.YEAR:
      return "Yearly";
  }
}

function formatEffectiveSource(planOffer: PlanOfferAdminListItem) {
  const scope = planOffer.effective_config_summary.source_scope;

  if (!scope) {
    return "Inactive";
  }

  if (scope === PlanOfferScope.PRODUCT) {
    return "Product";
  }

  return "Variant";
}

function formatDiscountRange(min?: number, max?: number) {
  if (typeof min === "number" && typeof max === "number") {
    return `${min}-${max}`;
  }

  if (typeof min === "number") {
    return `${min}+`;
  }

  if (typeof max === "number") {
    return `Up to ${max}`;
  }

  return "-";
}
