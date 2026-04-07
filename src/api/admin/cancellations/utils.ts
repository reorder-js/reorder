import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { GetAdminCancellationsSchemaType } from "./validators"
import {
  getAdminCancellationDetail,
  listAdminCancellationCases,
  type ListAdminCancellationCasesInput,
} from "../../../modules/cancellation/utils/admin-query"

export function normalizeAdminCancellationsListQuery(
  query: GetAdminCancellationsSchemaType
): ListAdminCancellationCasesInput {
  const normalized: ListAdminCancellationCasesInput = {
    limit: query.limit,
    offset: query.offset,
    q: query.q,
    status: query.status,
    final_outcome: query.final_outcome,
    reason_category: query.reason_category,
    offer_type: query.offer_type,
    subscription_id: query.subscription_id,
    created_from: query.created_from,
    created_to: query.created_to,
  }

  if (query.order) {
    if (query.order.startsWith("-")) {
      normalized.order = query.order.slice(1)
      normalized.direction = "desc"
    } else {
      normalized.order = query.order
      normalized.direction = query.direction
    }
  } else {
    normalized.direction = query.direction
  }

  return normalized
}

export async function getAdminCancellationDetailResponse(
  container: MedusaContainer,
  id: string
) {
  return await getAdminCancellationDetail(container, id)
}

export async function getAdminCancellationsListResponse(
  container: MedusaContainer,
  query: GetAdminCancellationsSchemaType
) {
  return await listAdminCancellationCases(
    container,
    normalizeAdminCancellationsListQuery(query)
  )
}

function getNestedMessage(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    return value
  }

  if (value instanceof Error) {
    const causeMessage = getNestedMessage((value as Error & { cause?: unknown }).cause)
    return value.message || causeMessage || null
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>

    const candidates = [
      record.message,
      record.error,
      record.details,
      record.cause,
      (record.response as Record<string, unknown> | undefined)?.data,
      (record.response as Record<string, unknown> | undefined)?.message,
      (record.data as Record<string, unknown> | undefined)?.message,
      (record.body as Record<string, unknown> | undefined)?.message,
    ]

    for (const candidate of candidates) {
      const nested = getNestedMessage(candidate)

      if (nested) {
        return nested
      }
    }
  }

  return null
}

export function mapCancellationAdminRouteError(error: unknown) {
  const errorCause =
    error instanceof Error ? (error as Error & { cause?: unknown }).cause : null
  const medusaError =
    error instanceof MedusaError
      ? error
      : errorCause instanceof MedusaError
        ? errorCause
        : null

  if (medusaError) {
    const typeToStatus: Record<string, number> = {
      [MedusaError.Types.NOT_FOUND]: 404,
      [MedusaError.Types.INVALID_DATA]: 400,
      [MedusaError.Types.CONFLICT]: 409,
    }

    return {
      status: typeToStatus[medusaError.type] ?? 500,
      type: medusaError.type,
      message: medusaError.message,
    }
  }

  const message = getNestedMessage(error) || "Unexpected cancellation admin error"
  const normalized = message.toLowerCase()

  if (normalized.includes("was not found")) {
    return {
      status: 404,
      type: MedusaError.Types.NOT_FOUND,
      message,
    }
  }

  if (normalized.includes("invalid") || normalized.includes("missing")) {
    return {
      status: 400,
      type: MedusaError.Types.INVALID_DATA,
      message,
    }
  }

  return {
    status: 409,
    type: MedusaError.Types.CONFLICT,
    message,
  }
}
