import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLABLE_REQUEST_STATUSES,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  type CancelRequestInput,
  type CancellationContext,
  type RequestParticipant,
} from "@omini/shared";
import { ApiError } from "../src/api-error";
import { parseInput } from "../src/auth/auth.validation";
import { requestActionSchema } from "../src/requests/validation";
import {
  cancelRequestSchema,
  validateCancellationInput,
} from "../src/requests/cancellation.validation";

const key = "10000000-0000-4000-8000-00000000000a";
const accepted: CancellationContext = {
  status: "ACCEPTED",
  participant: "client",
};
const valid: CancelRequestInput = {
  version: 3,
  idempotencyKey: key,
  confirmed: true,
  reasonCode: "PRICE_DISAGREEMENT",
};
function rejects(
  input: unknown,
  context = accepted,
  code = "VALIDATION_ERROR",
  status = 400,
) {
  assert.throws(
    () => validateCancellationInput(context, input),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, code);
      assert.equal(error.getStatus(), status);
      return true;
    },
  );
}

test("new cancellation contract accepts both original participant roles in every approved post-acceptance state", () => {
  assert.deepEqual(parseInput(cancelRequestSchema, valid), valid);
  for (const participant of ["client", "provider"] as const)
    for (const status of [
      "ACCEPTED",
      "IN_PROGRESS",
      "AWAITING_CONFIRMATION",
    ] as const) {
      const value = validateCancellationInput(
        { status, participant },
        { ...valid, executionContext: "PARTIAL" },
      );
      assert.equal(value.reasonCode, "PRICE_DISAGREEMENT");
      assert.equal(value.executionContext, "PARTIAL");
      assert.equal(value.confirmed, true);
    }
});

test("requested cancellation remains client-only; provider rejection is a separate unchanged action", () => {
  assert.ok(
    validateCancellationInput(
      { status: "REQUESTED", participant: "client" },
      valid,
    ),
  );
  rejects(
    valid,
    { status: "REQUESTED", participant: "provider" },
    "ACTION_FORBIDDEN",
    403,
  );
  assert.deepEqual(REQUEST_TRANSITIONS.reject, {
    from: ["REQUESTED"],
    to: "REJECTED",
    actor: "provider",
  });
});

test("completed, rejected and cancelled requests reject fresh cancellation for either role", () => {
  for (const participant of ["client", "provider"] as const)
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"] as const)
      rejects(valid, { status, participant }, "INVALID_TRANSITION", 409);
});

test("unknown runtime status or participant fails closed instead of gaining eligibility", () => {
  rejects(
    valid,
    {
      status: "UNKNOWN",
      participant: "client",
    } as unknown as CancellationContext,
    "INVALID_TRANSITION",
    409,
  );
  rejects(
    valid,
    {
      status: "ACCEPTED",
      participant: "admin",
    } as unknown as CancellationContext,
    "ACTION_FORBIDDEN",
    403,
  );
});

test("started services require context and allow none, partial, full claimed and disputed without turning them into completion", () => {
  for (const participant of ["client", "provider"] as const)
    for (const status of ["IN_PROGRESS", "AWAITING_CONFIRMATION"] as const) {
      rejects(valid, { status, participant });
      // A false flag cannot bypass the context required by the stored state.
      rejects(valid, { status, participant, hasRecordedStart: false });
      for (const executionContext of CANCELLATION_EXECUTION_CONTEXTS) {
        const context = { status, participant };
        assert.equal(
          validateCancellationInput(context, { ...valid, executionContext })
            .executionContext,
          executionContext,
        );
      }
    }
});

test("a recorded start also requires context even if the status is accepted; absence is not silently reported as NONE", () => {
  rejects(valid, { ...accepted, hasRecordedStart: true });
  assert.equal(
    validateCancellationInput(accepted, valid).executionContext,
    undefined,
  );
  assert.equal(
    validateCancellationInput(
      { ...accepted, hasRecordedStart: true },
      { ...valid, executionContext: "PARTIAL" },
    ).executionContext,
    "PARTIAL",
  );
});

test("execution context is a single exact enum, never coerced or accepted as a list", () => {
  for (const executionContext of [
    null,
    "",
    "partial",
    "COMPLETED",
    true,
    1,
    ["NONE", "PARTIAL"],
    {},
  ])
    rejects({ ...valid, executionContext });
});

test("cancellation requires explicit true confirmation with no implicit default or boolean coercion", () => {
  const { confirmed: _confirmed, ...withoutConfirmation } = valid;
  assert.equal(_confirmed, true);
  rejects(withoutConfirmation);
  for (const confirmed of [false, undefined, null, "true", 1])
    rejects({ ...valid, confirmed });
});

test("reason must be a single known code and cannot be supplied as arbitrary display text or several codes", () => {
  const { reasonCode: _reasonCode, ...withoutReason } = valid;
  assert.equal(_reasonCode, "PRICE_DISAGREEMENT");
  rejects(withoutReason);
  for (const reasonCode of [
    undefined,
    null,
    "",
    "price_disagreement",
    "Não chegamos a um acordo sobre o valor",
    ["PRICE_DISAGREEMENT", "OTHER"],
    { code: "OTHER" },
  ])
    rejects({ ...valid, reasonCode });
  rejects({ ...valid, reasonCodes: ["PRICE_DISAGREEMENT"] });
});

test("client/provider-specific reasons are checked against the participant context, not a role submitted in the body", () => {
  const provider: CancellationContext = {
    ...accepted,
    participant: "provider",
  };
  assert.equal(
    validateCancellationInput(accepted, {
      ...valid,
      reasonCode: "SERVICE_NO_LONGER_NEEDED",
    }).reasonCode,
    "SERVICE_NO_LONGER_NEEDED",
  );
  assert.equal(
    validateCancellationInput(provider, {
      ...valid,
      reasonCode: "UNABLE_TO_ATTEND",
    }).reasonCode,
    "UNABLE_TO_ATTEND",
  );
  rejects({ ...valid, reasonCode: "UNABLE_TO_ATTEND" });
  rejects({ ...valid, reasonCode: "SERVICE_NO_LONGER_NEEDED" }, provider);
  rejects({
    ...valid,
    participant: "provider",
    reasonCode: "UNABLE_TO_ATTEND",
  });
});

test("OTHER requires 10..500 characters after trim/NFC and predefined reasons cannot carry an additional free-form reason", () => {
  for (const length of [10, 500]) {
    const reason = "a".repeat(length);
    assert.equal(
      validateCancellationInput(accepted, {
        ...valid,
        reasonCode: "OTHER",
        reason: `  ${reason}  `,
      }).reason,
      reason,
    );
  }
  for (const reason of [
    undefined,
    null,
    "",
    "   ",
    "a".repeat(9),
    "a".repeat(501),
  ])
    rejects({ ...valid, reasonCode: "OTHER", reason });
  rejects({ ...valid, reason: "Também quero informar outro motivo." });
});

test("OTHER normalizes accented text consistently without mutating the submitted object", () => {
  const input = {
    ...valid,
    reasonCode: "OTHER",
    reason: "  Na\u0303o conseguimos combinar a visita.  ",
  };
  const before = structuredClone(input);
  const value = validateCancellationInput(accepted, input);
  assert.equal(value.reason, "Não conseguimos combinar a visita.");
  assert.deepEqual(input, before);
});

test("free-text validation rejects obvious private identifiers, markup and controls without echoing the submitted content", () => {
  for (const reason of [
    "Contato (48) 99876-5432",
    "Fale com privado@example.test",
    "Veja https://example.test/segredo",
    "Visita na Rua das Flores 123",
    "<script>texto privado</script>",
    "Motivo privado\u0000 aqui.",
  ]) {
    assert.throws(
      () =>
        validateCancellationInput(accepted, {
          ...valid,
          reasonCode: "OTHER",
          reason,
        }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.deepEqual(error.fields, ["reason"]);
        assert.ok(!error.message.includes(reason));
        return true;
      },
    );
  }
});

test("version and idempotency key are required and bounded; UUID is canonicalized", () => {
  for (const version of [0, -1, 1.5, 2147483647, "3", null, undefined])
    rejects({ ...valid, version });
  for (const idempotencyKey of [
    "",
    "not-a-uuid",
    key + "extra",
    null,
    undefined,
  ])
    rejects({ ...valid, idempotencyKey });
  assert.equal(
    validateCancellationInput(accepted, {
      ...valid,
      idempotencyKey: key.toUpperCase(),
    }).idempotencyKey,
    key,
  );
  assert.equal(
    validateCancellationInput(accepted, { ...valid, version: 2147483646 })
      .version,
    2147483646,
  );
});

test("clients cannot choose authors, state, dates, stored context, execution proof or counterparty consent in cancellation bodies", () => {
  for (const property of [
    "actorUserId",
    "clientUserId",
    "providerUserId",
    "requestId",
    "status",
    "cancelledAt",
    "completedAt",
    "occurredAt",
    "hasRecordedStart",
    "noServicePerformed",
    "approvedByOtherParticipant",
    "role",
  ])
    rejects({ ...valid, [property]: "spoofed" });
  for (const input of [undefined, null, [], "cancel", 1]) rejects(input);
});

test("legacy parsing is preserved while cancellation transitions are integrated with the backend", () => {
  assert.deepEqual(
    parseInput(requestActionSchema, { version: 2, idempotencyKey: key }),
    { version: 2, idempotencyKey: key },
  );
  assert.throws(() => parseInput(requestActionSchema, valid));
  assert.deepEqual(REQUEST_TRANSITIONS.cancel, {
    from: ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "AWAITING_CONFIRMATION"],
    to: "CANCELLED",
    actor: "either",
  });
  assert.deepEqual(
    REQUEST_STATUSES.filter(
      (status) =>
        !CANCELLABLE_REQUEST_STATUSES.some(
          (cancellable) => cancellable === status,
        ),
    ),
    ["REJECTED", "COMPLETED", "CANCELLED"],
  );
});

test("contextual cancellation validation is pure and carries no requirement for approval by another participant", () => {
  for (const participant of [
    "client",
    "provider",
  ] satisfies RequestParticipant[]) {
    const context: CancellationContext = {
      status: "AWAITING_CONFIRMATION",
      participant,
    };
    const input: Readonly<CancelRequestInput> = Object.freeze({
      ...valid,
      executionContext: "FULL_CLAIMED",
    });
    const before = structuredClone(context);
    assert.equal(
      validateCancellationInput(context, input).executionContext,
      "FULL_CLAIMED",
    );
    assert.deepEqual(context, before);
    assert.equal(
      "approvedByOtherParticipant" in validateCancellationInput(context, input),
      false,
    );
  }
});
