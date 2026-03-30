import type { DunningRetrySchedule } from "../types"

export const DEFAULT_DUNNING_RETRY_INTERVALS = [1440, 4320, 10080]
export const DEFAULT_DUNNING_MAX_ATTEMPTS =
  DEFAULT_DUNNING_RETRY_INTERVALS.length

export function createDefaultDunningRetrySchedule(): DunningRetrySchedule {
  return {
    strategy: "fixed_intervals",
    intervals: [...DEFAULT_DUNNING_RETRY_INTERVALS],
    timezone: "UTC",
    source: "default_policy",
  }
}

export function validateDunningRetrySchedule(
  schedule: DunningRetrySchedule,
  maxAttempts: number
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error("Dunning max_attempts must be a positive integer")
  }

  if (schedule.strategy !== "fixed_intervals") {
    throw new Error(
      `Unsupported dunning retry strategy '${schedule.strategy}'`
    )
  }

  if (schedule.timezone !== "UTC") {
    throw new Error(
      `Unsupported dunning retry timezone '${schedule.timezone}'`
    )
  }

  if (!Array.isArray(schedule.intervals) || schedule.intervals.length === 0) {
    throw new Error("Dunning retry schedule must define at least one interval")
  }

  if (schedule.intervals.some((interval) => interval <= 0)) {
    throw new Error(
      "Dunning retry schedule intervals must be positive minute offsets"
    )
  }

  if (schedule.intervals.some((interval) => !Number.isInteger(interval))) {
    throw new Error(
      "Dunning retry schedule intervals must be integer minute offsets"
    )
  }

  if (schedule.intervals.length !== maxAttempts) {
    throw new Error(
      "Dunning retry schedule intervals length must match max_attempts"
    )
  }
}

export function calculateNextRetryAt(
  schedule: DunningRetrySchedule,
  attemptCount: number,
  anchor: Date
) {
  const intervalMinutes = schedule.intervals[attemptCount]

  if (intervalMinutes === undefined) {
    return null
  }

  return new Date(anchor.getTime() + intervalMinutes * 60 * 1000)
}
