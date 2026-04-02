type DailyQualitySnapshot = {
  metric_date: string
  processed_subscriptions: number
  snapshot_rows: number
  active_subscriptions_count: number
  churned_subscriptions_count: number
  mrr_amount: number | null
}

export type AnalyticsQualitySeverity = "warn" | "error"

export type AnalyticsQualityFinding = {
  code:
    | "analytics.snapshot.empty_day"
    | "analytics.snapshot.incomplete_day"
    | "analytics.mrr.spike"
    | "analytics.churn_rate.spike"
  severity: AnalyticsQualitySeverity
  metric: "snapshot" | "mrr" | "churn_rate"
  date: string
  message: string
  metadata: Record<string, unknown> | null
}

const MRR_CHANGE_THRESHOLD_PERCENT = 50
const CHURN_RATE_ABSOLUTE_THRESHOLD = 25
const CHURN_RATE_DELTA_THRESHOLD = 15

function round(value: number) {
  return Number(value.toFixed(2))
}

function computeChurnRate(
  churnedSubscriptionsCount: number,
  activeSubscriptionsCount: number
) {
  if (activeSubscriptionsCount <= 0) {
    return 0
  }

  return (churnedSubscriptionsCount / activeSubscriptionsCount) * 100
}

export function evaluateAnalyticsQualityForRange(
  snapshots: DailyQualitySnapshot[]
) {
  const findings: AnalyticsQualityFinding[] = []
  const ordered = [...snapshots].sort((left, right) =>
    left.metric_date.localeCompare(right.metric_date)
  )

  ordered.forEach((snapshot, index) => {
    if (snapshot.processed_subscriptions > 0 && snapshot.snapshot_rows === 0) {
      findings.push({
        code: "analytics.snapshot.empty_day",
        severity: "error",
        metric: "snapshot",
        date: snapshot.metric_date,
        message:
          "Analytics rebuild produced no snapshot rows for a day with processed subscriptions",
        metadata: {
          processed_subscriptions: snapshot.processed_subscriptions,
          snapshot_rows: snapshot.snapshot_rows,
        },
      })
    }

    if (
      snapshot.processed_subscriptions > 0 &&
      snapshot.snapshot_rows !== snapshot.processed_subscriptions
    ) {
      findings.push({
        code: "analytics.snapshot.incomplete_day",
        severity: "error",
        metric: "snapshot",
        date: snapshot.metric_date,
        message:
          "Analytics rebuild produced a snapshot row count that does not match processed subscriptions",
        metadata: {
          processed_subscriptions: snapshot.processed_subscriptions,
          snapshot_rows: snapshot.snapshot_rows,
        },
      })
    }

    const previousSnapshot = index > 0 ? ordered[index - 1] : null

    if (!previousSnapshot) {
      return
    }

    if (
      snapshot.mrr_amount !== null &&
      previousSnapshot.mrr_amount !== null &&
      previousSnapshot.mrr_amount > 0
    ) {
      const deltaPercent =
        ((snapshot.mrr_amount - previousSnapshot.mrr_amount) /
          previousSnapshot.mrr_amount) *
        100

      if (Math.abs(deltaPercent) >= MRR_CHANGE_THRESHOLD_PERCENT) {
        findings.push({
          code: "analytics.mrr.spike",
          severity: "warn",
          metric: "mrr",
          date: snapshot.metric_date,
          message:
            "Daily MRR changed more than the configured anomaly threshold compared with the previous day",
          metadata: {
            current_mrr: round(snapshot.mrr_amount),
            previous_mrr: round(previousSnapshot.mrr_amount),
            delta_percentage: round(deltaPercent),
            threshold_percentage: MRR_CHANGE_THRESHOLD_PERCENT,
          },
        })
      }
    }

    const currentChurnRate = computeChurnRate(
      snapshot.churned_subscriptions_count,
      snapshot.active_subscriptions_count
    )
    const previousChurnRate = computeChurnRate(
      previousSnapshot.churned_subscriptions_count,
      previousSnapshot.active_subscriptions_count
    )

    if (
      currentChurnRate >= CHURN_RATE_ABSOLUTE_THRESHOLD ||
      Math.abs(currentChurnRate - previousChurnRate) >=
        CHURN_RATE_DELTA_THRESHOLD
    ) {
      findings.push({
        code: "analytics.churn_rate.spike",
        severity: "warn",
        metric: "churn_rate",
        date: snapshot.metric_date,
        message:
          "Daily churn rate exceeded the configured threshold or changed sharply compared with the previous day",
        metadata: {
          current_churn_rate: round(currentChurnRate),
          previous_churn_rate: round(previousChurnRate),
          delta_percentage: round(currentChurnRate - previousChurnRate),
          absolute_threshold: CHURN_RATE_ABSOLUTE_THRESHOLD,
          delta_threshold: CHURN_RATE_DELTA_THRESHOLD,
        },
      })
    }
  })

  return {
    findings,
    finding_count: findings.length,
    has_errors: findings.some((finding) => finding.severity === "error"),
    has_warnings: findings.some((finding) => finding.severity === "warn"),
  }
}
