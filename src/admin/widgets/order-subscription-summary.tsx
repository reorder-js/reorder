import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import {
  Container,
  Heading,
  StatusBadge,
  Text,
} from "@medusajs/ui";
import { ArrowPath, ShoppingBag, TriangleRightMini } from "@medusajs/icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { sdk } from "../lib/client";
import {
  AdminOrderSubscriptionSummaryResponse,
  SubscriptionAdminStatus,
} from "../types/subscription";

const getSubscriptionStatusColor = (status: SubscriptionAdminStatus) => {
  switch (status) {
    case SubscriptionAdminStatus.ACTIVE:
      return "green";
    case SubscriptionAdminStatus.PAUSED:
      return "orange";
    case SubscriptionAdminStatus.CANCELLED:
      return "grey";
    case SubscriptionAdminStatus.PAST_DUE:
      return "red";
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
};

const OrderSubscriptionSummaryWidget = ({
  data: order,
}: DetailWidgetProps<AdminOrder>) => {
  const { data, isLoading, isError } =
    useQuery<AdminOrderSubscriptionSummaryResponse>({
      queryKey: ["admin-order-subscription-summary", order.id],
      queryFn: () =>
        sdk.client.fetch(`/admin/orders/${order.id}/subscription-summary`),
    });

  const summary = data?.summary;

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Subscription</Heading>
      </div>
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <ArrowPath className="animate-spin text-ui-fg-subtle" />
            <Text size="small" className="text-ui-fg-subtle">
              Loading subscription summary...
            </Text>
          </div>
        ) : isError ? (
          <Text size="small" className="text-ui-fg-subtle">
            Failed to load subscription summary
          </Text>
        ) : !summary?.is_subscription_order || !summary.subscription ? (
          <Text size="small" className="text-ui-fg-subtle">
            One-time order
          </Text>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <StatusBadge color="green">Subscription order</StatusBadge>
            </div>
            <Link
              to={`/subscriptions/${summary.subscription.id}`}
              className="outline-none focus-within:shadow-borders-interactive-with-focus rounded-md [&:hover>div]:bg-ui-bg-component-hover"
            >
              <div className="shadow-elevation-card-rest bg-ui-bg-component rounded-md px-4 py-2 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="shadow-elevation-card-rest flex h-12 w-12 items-center justify-center rounded-md text-ui-fg-muted">
                    <ShoppingBag />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text size="small" leading="compact" weight="plus">
                      {summary.subscription.reference}
                    </Text>
                    <Text
                      size="small"
                      leading="compact"
                      className="text-ui-fg-subtle"
                    >
                      Subscription
                    </Text>
                  </div>
                  <div className="flex items-center">
                    <TriangleRightMini className="text-ui-fg-muted rtl:rotate-180" />
                  </div>
                </div>
              </div>
            </Link>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Status
                </Text>
                <StatusBadge
                  color={getSubscriptionStatusColor(summary.subscription.status)}
                >
                  {summary.subscription.status}
                </StatusBadge>
              </div>
              <div className="flex flex-col gap-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Frequency
                </Text>
                <Text size="small" weight="plus">
                  {summary.subscription.frequency_label}
                </Text>
              </div>
              <div className="flex flex-col gap-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Discount
                </Text>
                <Text size="small" weight="plus">
                  {summary.subscription.discount?.label ??
                    "subscription_discount"}
                </Text>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Text size="small" className="text-ui-fg-subtle">
                  Next renewal
                </Text>
                <Text size="small" weight="plus">
                  {formatDateTime(
                    summary.subscription.effective_next_renewal_at ??
                      summary.subscription.next_renewal_at
                  )}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
});

export default OrderSubscriptionSummaryWidget;
