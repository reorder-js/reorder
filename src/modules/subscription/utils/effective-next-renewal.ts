import { DateTime } from "luxon"
import { FrequencyInterval } from "../../../common/types/frequency-interval"

function toValidDate(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? new Date(value) : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

export function addSubscriptionCadence(
  anchor: Date,
  interval: FrequencyInterval,
  value: number
) {
  const dt = DateTime.fromJSDate(anchor, { zone: "utc" })

  switch (interval) {
    case FrequencyInterval.DAY:
      return dt.plus({ days: value }).toJSDate()
    case FrequencyInterval.WEEK:
      return dt.plus({ weeks: value }).toJSDate()
    case FrequencyInterval.MONTH:
      return dt.plus({ months: value }).toJSDate()
    case FrequencyInterval.YEAR:
      return dt.plus({ years: value }).toJSDate()
  }
}

export function getEffectiveNextRenewalAt(input: {
  next_renewal_at: string | Date | null | undefined
  skip_next_cycle: boolean
  frequency_interval: FrequencyInterval
  frequency_value: number
}) {
  const nextRenewalAt = toValidDate(input.next_renewal_at)

  if (!nextRenewalAt) {
    return null
  }

  if (!input.skip_next_cycle) {
    return nextRenewalAt
  }

  return addSubscriptionCadence(
    nextRenewalAt,
    input.frequency_interval,
    input.frequency_value
  )
}
