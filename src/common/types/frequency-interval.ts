export const FrequencyInterval = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
} as const

export type FrequencyInterval = (typeof FrequencyInterval)[keyof typeof FrequencyInterval]

export const isFrequencyInterval = (value: unknown): value is FrequencyInterval =>
  typeof value === "string" && Object.values(FrequencyInterval).includes(value as FrequencyInterval)
