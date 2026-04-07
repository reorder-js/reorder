import { z } from "zod"
import { CancellationReasonCategory } from "../../../../../modules/cancellation/types"

const metadataSchema = z.record(z.string(), z.unknown()).optional()

export const PostStoreStartCancellationSchema = z.object({
  reason: z.string().trim().min(1),
  reason_category: z.nativeEnum(CancellationReasonCategory).optional(),
  notes: z.string().trim().optional(),
  metadata: metadataSchema,
})

export type PostStoreStartCancellationSchemaType = z.infer<
  typeof PostStoreStartCancellationSchema
>
