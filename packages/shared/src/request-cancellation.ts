import type { RequestParticipant, RequestStatus } from "./index";

/** Phase 2.6 contract, integrated with the backend cancellation operation. */
export const CANCELLATION_TARGET_STATUS = "CANCELLED" satisfies RequestStatus;
export const CANCELLABLE_REQUEST_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
] as const satisfies readonly RequestStatus[];

export const PREDEFINED_CANCELLATION_REASON_CODES = [
  "PRICE_DISAGREEMENT",
  "SCHEDULE_DISAGREEMENT",
  "SCOPE_DISAGREEMENT",
  "SERVICE_NO_LONGER_NEEDED",
  "UNABLE_TO_ATTEND",
] as const;
export const CANCELLATION_REASON_CODES = [
  ...PREDEFINED_CANCELLATION_REASON_CODES,
  "OTHER",
] as const;
export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

/** Statements by the cancelling participant, never proof or confirmation of completion. */
export const CANCELLATION_EXECUTION_CONTEXTS = [
  "NONE",
  "PARTIAL",
  "FULL_CLAIMED",
  "DISPUTED",
] as const;
export type CancellationExecutionContext =
  (typeof CANCELLATION_EXECUTION_CONTEXTS)[number];
export const CANCELLATION_EXECUTION_LABELS = Object.freeze({
  NONE: "Nenhum trabalho executado",
  PARTIAL: "Trabalho parcialmente executado",
  FULL_CLAIMED: "Execução integral alegada",
  DISPUTED: "Situação de execução contestada",
} satisfies Record<CancellationExecutionContext, string>);

export const CANCELLATION_REASON_LABELS = Object.freeze({
  PRICE_DISAGREEMENT: "Não chegamos a um acordo sobre o valor",
  SCHEDULE_DISAGREEMENT: "Não conseguimos combinar uma data",
  SCOPE_DISAGREEMENT: "Não chegamos a um acordo sobre o serviço",
  SERVICE_NO_LONGER_NEEDED: "Não preciso mais deste atendimento",
  UNABLE_TO_ATTEND: "Não consigo realizar este atendimento",
  OTHER: "Outro motivo",
} satisfies Record<CancellationReasonCode, string>);

export interface CancellationReasonOption {
  readonly code: CancellationReasonCode;
  readonly label: string;
}
const commonReasons = [
  "PRICE_DISAGREEMENT",
  "SCHEDULE_DISAGREEMENT",
  "SCOPE_DISAGREEMENT",
] as const;
const options = (codes: readonly CancellationReasonCode[]) =>
  Object.freeze(
    codes.map((code) =>
      Object.freeze({
        code,
        label: CANCELLATION_REASON_LABELS[code],
      }),
    ),
  );
const clientReasons = options([
  ...commonReasons,
  "SERVICE_NO_LONGER_NEEDED",
  "OTHER",
]);
const providerReasons = options([
  ...commonReasons,
  "UNABLE_TO_ATTEND",
  "OTHER",
]);

export function cancellationReasons(
  participant: RequestParticipant,
): readonly CancellationReasonOption[] {
  if (participant === "client") return clientReasons;
  if (participant === "provider") return providerReasons;
  return [];
}

/** Eligibility only. Authentication and request ownership remain the server's responsibility. */
export function canCancelRequest(
  status: RequestStatus,
  participant: RequestParticipant,
): boolean {
  if (participant !== "client" && participant !== "provider") return false;
  if (status === "REQUESTED") return participant === "client";
  return (
    status === "ACCEPTED" ||
    status === "IN_PROGRESS" ||
    status === "AWAITING_CONFIRMATION"
  );
}

/** Context must be derived from the stored request, never accepted from the HTTP body. */
export interface CancellationContext {
  status: RequestStatus;
  participant: RequestParticipant;
  hasRecordedStart?: boolean;
}
export function requiresCancellationExecutionContext(
  context: CancellationContext,
): boolean {
  return (
    context.status === "IN_PROGRESS" ||
    context.status === "AWAITING_CONFIRMATION" ||
    context.hasRecordedStart === true
  );
}

type CancellationBaseInput = {
  version: number;
  idempotencyKey: string;
  /** Sent only after explicit confirmation; the server must not default it. */
  confirmed: true;
  executionContext?: CancellationExecutionContext;
};
export type CancelRequestInput = CancellationBaseInput &
  (
    | {
        reasonCode: (typeof PREDEFINED_CANCELLATION_REASON_CODES)[number];
        reason?: never;
      }
    | { reasonCode: "OTHER"; reason: string }
  );
export type CancelStartedRequestInput = CancelRequestInput & {
  executionContext: CancellationExecutionContext;
};

/** Optional metadata: historical events remain readable without classification/backfill. */
export interface CancellationEventMetadata {
  reasonCode?: CancellationReasonCode | null;
  executionContext?: CancellationExecutionContext | null;
}
