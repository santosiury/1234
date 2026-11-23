import {
  CANCELLATION_REASON_CODES,
  CANCELLATION_REASON_LABELS,
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLATION_EXECUTION_LABELS,
  CANCELLATION_TARGET_STATUS,
  REQUEST_STATUSES,
  allowedRequestActions,
  canCancelRequest,
  cancellationReasons,
  requiresCancellationExecutionContext,
  type RequestEventView,
  type RequestParticipant,
} from "@omini/shared";

test("Fase 2.6 cancellation eligibility covers every state and participant without introducing new states", () => {
  const expected: Record<
    (typeof REQUEST_STATUSES)[number],
    readonly RequestParticipant[]
  > = {
    REQUESTED: ["client"],
    ACCEPTED: ["client", "provider"],
    IN_PROGRESS: ["client", "provider"],
    AWAITING_CONFIRMATION: ["client", "provider"],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
  };
  for (const status of REQUEST_STATUSES)
    for (const participant of ["client", "provider"] as const)
      expect(canCancelRequest(status, participant)).toBe(
        expected[status].includes(participant),
      );
  expect(CANCELLATION_TARGET_STATUS).toBe("CANCELLED");
  expect(REQUEST_STATUSES).toHaveLength(7);
});

test("reason lists have one shared price-first option, role-specific choices and OTHER last, without a default selection", () => {
  for (const participant of ["client", "provider"] as const) {
    const choices = cancellationReasons(participant);
    expect(choices[0]).toEqual({
      code: "PRICE_DISAGREEMENT",
      label: "Não chegamos a um acordo sobre o valor",
    });
    expect(choices.at(-1)?.code).toBe("OTHER");
    expect(new Set(choices.map((choice) => choice.code)).size).toBe(
      choices.length,
    );
    expect(choices.every((choice) => !Object.hasOwn(choice, "selected"))).toBe(
      true,
    );
    for (const choice of choices) {
      expect(CANCELLATION_REASON_CODES).toContain(choice.code);
      expect(choice.label).toBe(CANCELLATION_REASON_LABELS[choice.code]);
    }
  }
  expect(cancellationReasons("client").map((reason) => reason.code)).toContain(
    "SERVICE_NO_LONGER_NEEDED",
  );
  expect(
    cancellationReasons("client").map((reason) => reason.code),
  ).not.toContain("UNABLE_TO_ATTEND");
  expect(
    cancellationReasons("provider").map((reason) => reason.code),
  ).toContain("UNABLE_TO_ATTEND");
  expect(
    cancellationReasons("provider").map((reason) => reason.code),
  ).not.toContain("SERVICE_NO_LONGER_NEEDED");
});

test("execution choices describe the actor's statement, including partial/full claimed/disputed, without claiming verified completion", () => {
  expect(CANCELLATION_EXECUTION_CONTEXTS).toEqual([
    "NONE",
    "PARTIAL",
    "FULL_CLAIMED",
    "DISPUTED",
  ]);
  expect(CANCELLATION_EXECUTION_LABELS.FULL_CLAIMED).toBe(
    "Execução integral alegada",
  );
  expect(CANCELLATION_EXECUTION_LABELS.DISPUTED).toBe(
    "Situação de execução contestada",
  );
  expect(
    requiresCancellationExecutionContext({
      status: "ACCEPTED",
      participant: "client",
    }),
  ).toBe(false);
  expect(
    requiresCancellationExecutionContext({
      status: "ACCEPTED",
      participant: "provider",
      hasRecordedStart: true,
    }),
  ).toBe(true);
  for (const participant of ["client", "provider"] as const)
    for (const status of ["IN_PROGRESS", "AWAITING_CONFIRMATION"] as const)
      expect(
        requiresCancellationExecutionContext({
          status,
          participant,
          hasRecordedStart: false,
        }),
      ).toBe(true);
});

test("historical events need no fabricated cancellation metadata and new metadata does not replace their original actor/date/reason", () => {
  const historical: RequestEventView = {
    id: "10000000-0000-4000-8000-000000000001",
    actor: "client",
    previousStatus: "ACCEPTED",
    newStatus: "CANCELLED",
    occurredAt: "2026-11-15T12:00:00Z",
    reason: "Motivo antigo preservado.",
    version: 3,
  };
  expect(historical.reasonCode).toBeUndefined();
  expect(historical.executionContext).toBeUndefined();
  const current: RequestEventView = {
    ...historical,
    reasonCode: "PRICE_DISAGREEMENT",
    executionContext: "PARTIAL",
  };
  expect(current.actor).toBe(historical.actor);
  expect(current.occurredAt).toBe(historical.occurredAt);
  expect(current.reason).toBe(historical.reason);
  expect(current.newStatus).toBe("CANCELLED");
});

test("shared allowed actions now match backend cancellation without allowing provider cancellation in REQUESTED", () => {
  expect(canCancelRequest("IN_PROGRESS", "provider")).toBe(true);
  expect(allowedRequestActions("IN_PROGRESS", "provider")).toContain("cancel");
  expect(allowedRequestActions("ACCEPTED", "provider")).toContain("cancel");
  expect(allowedRequestActions("REQUESTED", "provider")).toEqual([
    "accept",
    "reject",
  ]);
});
