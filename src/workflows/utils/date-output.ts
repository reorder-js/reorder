export function toISOStringOrNull(
  value: Date | string | null | undefined
): string | null {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    return value
  }

  return value.toISOString()
}
