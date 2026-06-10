export const isSubscriptionItem = <ItemLike extends { metadata?: Record<string, unknown> | null }>(item: ItemLike): boolean => {
  return item.metadata?.["is_subscription"] === true || item.metadata?.["is_subscription"] === "true"
}
