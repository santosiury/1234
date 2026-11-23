import { z } from "zod";
import {
  CANCELLABLE_REQUEST_STATUSES,
  CANCELLATION_EXECUTION_CONTEXTS,
  PREDEFINED_CANCELLATION_REASON_CODES,
  canCancelRequest,
  cancellationReasons,
  hasPrivateRequestData,
  requiresCancellationExecutionContext,
  type CancellationContext,
  type CancelRequestInput,
} from "@omini/shared";
import { ApiError } from "../api-error";
import { parseInput } from "../auth/auth.validation";
import { requestIdSchema, requestActionSchema } from "./validation";

const base = {
  version: z.number().int().min(1).max(2147483646),
  idempotencyKey: requestIdSchema,
  confirmed: z.literal(true),
  executionContext: z.enum(CANCELLATION_EXECUTION_CONTEXTS).optional(),
};
const otherReason = z
  .string()
  .trim()
  .transform((value) => value.normalize("NFC"))
  .pipe(
    z
      .string()
      .min(10)
      .max(500)
      .refine(
        (value) =>
          !hasPrivateRequestData(value) &&
          !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      ),
  );

/** Structured cancellation body. State/participant checks belong to validateCancellationInput. */
export const cancelRequestSchema = z.discriminatedUnion("reasonCode", [
  z
    .object({
      ...base,
      reasonCode: z.enum(PREDEFINED_CANCELLATION_REASON_CODES),
    })
    .strict(),
  z
    .object({ ...base, reasonCode: z.literal("OTHER"), reason: otherReason })
    .strict(),
]);

// Legacy shape is accepted only for REQUESTED or recovery of an existing receipt.
// The service checks receipts BEFORE requiring new cancellation metadata.
export const cancellationIntentSchema = z.union([
  cancelRequestSchema,
  requestActionSchema,
]);

/** Validate a NEW intent. Receipt recovery and version compare-and-set belong to the service. */
export function validateCancellationInput(
  context: CancellationContext,
  input: unknown,
): CancelRequestInput {
  const value = parseInput(cancelRequestSchema, input);
  if (!CANCELLABLE_REQUEST_STATUSES.some((status) => status === context.status))
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      "Este atendimento não pode ser cancelado.",
    );
  if (!canCancelRequest(context.status, context.participant))
    throw new ApiError(
      403,
      "ACTION_FORBIDDEN",
      "Esta ação não está disponível para sua conta.",
    );
  if (
    !cancellationReasons(context.participant).some(
      (reason) => reason.code === value.reasonCode,
    )
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Escolha um motivo disponível para seu perfil nesta solicitação.",
      ["reasonCode"],
    );
  if (
    requiresCancellationExecutionContext(context) &&
    value.executionContext === undefined
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Informe a situação de execução do atendimento.",
      ["executionContext"],
    );
  return value;
}
