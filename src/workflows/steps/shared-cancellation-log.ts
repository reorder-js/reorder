export type CancellationSubscriptionDisplayRecord = {
  id: string
  reference: string
  customer_id: string
  customer_snapshot: {
    full_name?: string | null
  } | null
  product_snapshot: {
    product_title?: string | null
    variant_title?: string | null
  } | null
}
