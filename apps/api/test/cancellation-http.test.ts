import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLATION_REASON_LABELS,
  type CancelRequestInput,
  type ServiceRequestDetail,
  type ReviewsPage,
} from "@omini/shared";
import { fixture } from "./support/phase25.fixture";
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function at(
  f: Fixture,
  status: "ACCEPTED" | "IN_PROGRESS" | "AWAITING_CONFIRMATION" | "COMPLETED",
) {
  let row = await f.create();
  for (const action of [
    "accept",
    "start",
    "propose-completion",
    "confirm-completion",
  ] as const) {
    const r = await f.act(
      row,
      action,
      action === "confirm-completion" ? f.client : f.provider,
    );
    assert.equal(r.status, 200);
    row = (await r.json()) as ServiceRequestDetail;
    if (row.status === status) return row;
  }
  throw Error("Invalid fixture state");
}
function intent(
  row: ServiceRequestDetail,
  extra: Partial<CancelRequestInput> = {},
): CancelRequestInput {
  return {
    version: row.version,
    idempotencyKey: randomUUID(),
    reasonCode: "PRICE_DISAGREEMENT",
    confirmed: true,
    ...(row.startedAt ? { executionContext: "PARTIAL" as const } : {}),
    ...extra,
  } as CancelRequestInput;
}
const cancel = (
  f: Fixture,
  row: ServiceRequestDetail,
  body: unknown,
  who = f.client,
) => f.call(`requests/${row.id}/cancel`, "POST", body, who);

test("HTTP unilateral cancellation covers both participants, all post-acceptance states and every execution declaration", async () => {
  for (const participant of ["client", "provider"] as const)
    for (const state of [
      "ACCEPTED",
      "IN_PROGRESS",
      "AWAITING_CONFIRMATION",
    ] as const) {
      // Keep real guard windows isolated instead of weakening rate limits for the matrix.
      const f = await fixture();
      const who = f[participant];
      try {
        for (const executionContext of CANCELLATION_EXECUTION_CONTEXTS) {
          const row = await at(f, state),
            before = structuredClone(
              f.repo.history.filter((e) => e.requestId === row.id),
            );
          assert.ok(row.allowedActions.includes("cancel"));
          const response = await cancel(
            f,
            row,
            intent(row, { executionContext }),
            who,
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "no-store");
          const result = (await response.json()) as ServiceRequestDetail;
          assert.equal(result.status, "CANCELLED");
          assert.equal(result.version, row.version + 1);
          assert.equal(result.completedAt, null);
          assert.equal(result.canReview, false);
          assert.deepEqual(result.allowedActions, []);
          assert.equal(result.acceptedAt, row.acceptedAt);
          assert.equal(result.startedAt, row.startedAt);
          assert.equal(result.completionProposedAt, row.completionProposedAt);
          const event = result.events.at(-1)!;
          assert.equal(event.actor, who === f.client ? "client" : "provider");
          assert.equal(event.previousStatus, state);
          assert.equal(event.newStatus, "CANCELLED");
          assert.equal(event.reasonCode, "PRICE_DISAGREEMENT");
          assert.equal(event.executionContext, executionContext);
          assert.equal(
            event.reason,
            CANCELLATION_REASON_LABELS.PRICE_DISAGREEMENT,
          );
          assert.equal(event.occurredAt, result.cancelledAt);
          assert.equal(result.updatedAt, result.cancelledAt);
          assert.deepEqual(
            f.repo.history.filter((e) => e.requestId === row.id).slice(0, -1),
            before,
          );
        }
      } finally {
        await f.app.close();
      }
    }
});

test("REQUESTED preserves the client legacy body while provider cancellation is denied and rejection remains available", async () => {
  const f = await fixture();
  try {
    const row = await f.create();
    assert.equal((await cancel(f, row, intent(row), f.provider)).status, 403);
    assert.equal(
      (
        await cancel(f, row, {
          version: row.version,
          idempotencyKey: randomUUID(),
        })
      ).status,
      200,
    );
    const rejected = await f.act(await f.create(), "reject");
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).status, "REJECTED");
    const structured = await f.create();
    assert.equal((await cancel(f, structured, intent(structured))).status, 200);
  } finally {
    await f.app.close();
  }
});

test("old applications cannot bypass structured reason/confirmation after acceptance and every invalid body is rejected without writes", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "IN_PROGRESS"),
      before = structuredClone(f.repo.rows.get(row.id)),
      history = structuredClone(f.repo.history);
    for (const who of [f.client, f.provider]) {
      const old = await cancel(
        f,
        row,
        {
          version: row.version,
          idempotencyKey: randomUUID(),
          reason: "Motivo livre antigo.",
        },
        who,
      );
      assert.equal(old.status, 400);
      assert.equal((await old.json()).code, "CANCELLATION_DETAILS_REQUIRED");
      for (const body of [
        { ...intent(row), executionContext: undefined },
        { ...intent(row), confirmed: false },
        { ...intent(row), confirmed: undefined },
        { ...intent(row), reasonCode: ["PRICE_DISAGREEMENT", "OTHER"] },
        { ...intent(row), reasonCode: "OTHER", reason: "a".repeat(9) },
        { ...intent(row), reasonCode: "OTHER", reason: "a".repeat(501) },
        { ...intent(row), reasonCode: "UNKNOWN" },
        { ...intent(row), executionContext: "COMPLETED" },
        { ...intent(row), actorUserId: f.other.user.id },
        { ...intent(row), status: "COMPLETED" },
        { ...intent(row), approvedByOtherParticipant: true },
      ])
        assert.equal((await cancel(f, row, body, who)).status, 400);
    }
    assert.deepEqual(f.repo.rows.get(row.id), before);
    assert.deepEqual(f.repo.history, history);
  } finally {
    await f.app.close();
  }
});

test("participant-specific reasons, OTHER boundaries and normalization are enforced by the real endpoint", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "ACCEPTED");
    assert.equal(
      (await cancel(f, row, { ...intent(row), reasonCode: "UNABLE_TO_ATTEND" }))
        .status,
      400,
    );
    assert.equal(
      (
        await cancel(
          f,
          row,
          { ...intent(row), reasonCode: "SERVICE_NO_LONGER_NEEDED" },
          f.provider,
        )
      ).status,
      400,
    );
    for (const [who, reasonCode] of [
      [f.client, "SERVICE_NO_LONGER_NEEDED"],
      [f.provider, "UNABLE_TO_ATTEND"],
    ] as const) {
      const r = await at(f, "ACCEPTED");
      assert.equal(
        (await cancel(f, r, { ...intent(r), reasonCode }, who)).status,
        200,
      );
    }
    for (const reason of [
      "a".repeat(10),
      "a".repeat(500),
      "  Na\u0303o conseguimos combinar o atendimento.  ",
    ]) {
      const r = await at(f, "ACCEPTED"),
        response = await cancel(f, r, {
          ...intent(r),
          reasonCode: "OTHER",
          reason,
        });
      assert.equal(response.status, 200);
      const result = (await response.json()) as ServiceRequestDetail;
      assert.equal(
        result.events.at(-1)?.reason,
        reason.trim().normalize("NFC"),
      );
      assert.equal(result.events.at(-1)?.executionContext, undefined);
    }
  } finally {
    await f.app.close();
  }
});

test("authentication, original participants, active profiles and private input checks cannot be forged by mode or body", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "ACCEPTED"),
      body = intent(row);
    assert.equal(
      (await f.call(`requests/${row.id}/cancel`, "POST", body)).status,
      401,
    );
    f.auth.users.get(f.other.user.email)!.user.profiles = {
      client: true,
      provider: true,
    };
    assert.equal((await cancel(f, row, body, f.other)).status, 404);
    assert.equal(
      (await f.call(`requests/${randomUUID()}/cancel`, "POST", body, f.other))
        .status,
      404,
    );
    const record = f.auth.users.get(f.provider.user.email)!;
    record.user.profiles.provider = false;
    assert.equal((await cancel(f, row, body, f.provider)).status, 403);
    record.user.profiles.provider = true;
    const session = [...f.auth.sessions.values()].find(
      (s) => s.user.id === f.client.user.id,
    )!;
    session.revoked = true;
    assert.equal((await cancel(f, row, body)).status, 401);
    assert.equal(f.repo.rows.get(row.id)?.status, "ACCEPTED");
  } finally {
    await f.app.close();
  }
});

test("new cancellations are idempotent by normalized content and reject changed reason or execution context", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "AWAITING_CONFIRMATION"),
      body = {
        ...intent(row),
        reasonCode: "OTHER",
        reason: "  Na\u0303o chegamos ao acordo.  ",
      },
      count = f.repo.history.length;
    const [a, b] = await Promise.all([
      cancel(f, row, body),
      cancel(f, row, {
        ...body,
        reason: "Não chegamos ao acordo.",
        idempotencyKey: body.idempotencyKey.toUpperCase(),
      }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const first = await a.json(),
      second = await b.json();
    assert.deepEqual(first, second);
    assert.equal(f.repo.history.length, count + 1);
    for (const changes of [
      { reason: "Outra descrição válida." },
      { executionContext: "NONE" },
      { reasonCode: "PRICE_DISAGREEMENT", reason: undefined },
    ]) {
      const response = await cancel(f, row, { ...body, ...changes });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "IDEMPOTENCY_CONFLICT");
    }
    const event = f.repo.history.at(-1)!;
    const expected = createHash("sha256")
      .update(
        JSON.stringify({
          id: row.id,
          action: "cancel",
          version: row.version,
          reason: "Não chegamos ao acordo.",
          reasonCode: "OTHER",
          executionContext: "PARTIAL",
          confirmed: true,
        }),
      )
      .digest("hex");
    assert.equal(event.payloadHash, expected);
  } finally {
    await f.app.close();
  }
});

test("historical accepted cancellation receipts retain the exact Fase 2.5 hash and recover without new fields or profile re-enrollment", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "ACCEPTED"),
      body = {
        version: row.version,
        idempotencyKey: randomUUID(),
        reason: "Motivo antigo preservado.",
      };
    const oldHash = createHash("sha256")
      .update(
        JSON.stringify({
          id: row.id,
          action: "cancel",
          version: body.version,
          reason: body.reason,
        }),
      )
      .digest("hex");
    await f.repo.transaction(async (tx) => {
      const now = await tx.now();
      await tx.patch(row.id, "ACCEPTED", row.version, {
        status: "CANCELLED",
        version: row.version + 1,
        updatedAt: now,
        cancelledAt: now,
      });
      await tx.append({
        requestId: row.id,
        actorUserId: f.client.user.id,
        previousStatus: "ACCEPTED",
        newStatus: "CANCELLED",
        action: "cancel",
        occurredAt: now,
        reason: body.reason,
        reasonCode: null,
        executionContext: null,
        version: row.version + 1,
        idempotencyKey: body.idempotencyKey,
        payloadHash: oldHash,
      });
    });
    const count = f.repo.history.length;
    f.auth.users.get(f.client.user.email)!.user.profiles.client = false;
    const response = await cancel(f, row, body);
    assert.equal(response.status, 200);
    const result = (await response.json()) as ServiceRequestDetail;
    assert.equal(result.status, "CANCELLED");
    assert.equal(result.events.at(-1)?.reason, body.reason);
    assert.equal(result.events.at(-1)?.reasonCode, undefined);
    assert.equal(result.events.at(-1)?.executionContext, undefined);
    assert.equal(f.repo.history.length, count);
    assert.equal(f.repo.history.at(-1)?.payloadHash, oldHash);
    assert.equal((await cancel(f, row, body, f.other)).status, 404);
  } finally {
    await f.app.close();
  }
});

test("final states reject new cancellation; stale versions and simultaneous participants produce a single winning event", async () => {
  const f = await fixture();
  try {
    const completed = await at(f, "COMPLETED"),
      rejected = (await (
        await f.act(await f.create(), "reject")
      ).json()) as ServiceRequestDetail;
    for (const row of [completed, rejected])
      for (const who of [f.client, f.provider])
        assert.equal((await cancel(f, row, intent(row), who)).status, 409);
    const row = await at(f, "ACCEPTED"),
      before = f.repo.history.length;
    const stale = await cancel(f, row, {
      ...intent(row),
      version: row.version - 1,
    });
    assert.equal(stale.status, 409);
    const responses = await Promise.all([
      cancel(f, row, intent(row)),
      cancel(f, row, intent(row), f.provider),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal(f.repo.history.length, before + 1);
    assert.equal(
      (await cancel(f, row, intent({ ...row, version: row.version + 1 })))
        .status,
      409,
    );
  } finally {
    await f.app.close();
  }
});

test("cancellation races with start or completion never overwrite the winning state or manufacture a completed service", async () => {
  const f = await fixture();
  try {
    for (const transition of ["start", "confirm-completion"] as const)
      for (const cancelFirst of [true, false]) {
        const row = await at(
            f,
            transition === "start" ? "ACCEPTED" : "AWAITING_CONFIRMATION",
          ),
          count = f.repo.history.length;
        const operations = [
          () => cancel(f, row, intent(row)),
          () =>
            f.act(
              row,
              transition,
              transition === "start" ? f.provider : f.client,
            ),
        ];
        if (!cancelFirst) operations.reverse();
        const responses = await Promise.all(operations.map((run) => run()));
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal(f.repo.history.length, count + 1);
        const saved = f.repo.rows.get(row.id)!;
        assert.ok(
          [
            "CANCELLED",
            transition === "start" ? "IN_PROGRESS" : "COMPLETED",
          ].includes(saved.status),
        );
        if (saved.status === "CANCELLED") {
          assert.equal(saved.completedAt, null);
          assert.equal(f.repo.history.at(-1)?.newStatus, "CANCELLED");
        }
      }
  } finally {
    await f.app.close();
  }
});

test("audit persistence failure rolls back state, version, dates and metadata; retry with the same key can then succeed", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "AWAITING_CONFIRMATION"),
      body = intent(row),
      before = structuredClone(f.repo.rows.get(row.id)),
      events = structuredClone(f.repo.history),
      categories = structuredClone(f.catalog.categoryRows);
    f.repo.failAppend = true;
    const failed = await cancel(f, row, body, f.provider);
    assert.equal(failed.status, 503);
    assert.doesNotMatch(
      await failed.text(),
      /private SQL|password|token|99876/i,
    );
    assert.deepEqual(f.repo.rows.get(row.id), before);
    assert.deepEqual(f.repo.history, events);
    assert.deepEqual(f.catalog.categoryRows, categories);
    f.repo.failAppend = false;
    assert.equal((await cancel(f, row, body, f.provider)).status, 200);
    assert.equal(f.repo.history.length, events.length + 1);
  } finally {
    await f.app.close();
  }
});

test("cancelled services immediately deny new contact/reviews while preexisting completed-service reputation is preserved", async () => {
  const f = await fixture();
  try {
    const completed = await at(f, "COMPLETED");
    assert.equal(
      (
        await f.call(
          `reviews/requests/${completed.id}`,
          "POST",
          { rating: 4, comment: "Bom atendimento." },
          f.client,
        )
      ).status,
      201,
    );
    const before = (await (
      await f.call(`reviews/providers/${f.workspace.id}`)
    ).json()) as ReviewsPage;
    for (const state of [
      "ACCEPTED",
      "IN_PROGRESS",
      "AWAITING_CONFIRMATION",
    ] as const)
      for (const who of [f.client, f.provider]) {
        const row = await at(f, state);
        assert.equal(
          (
            await f.call(
              `requests/${row.id}/contact`,
              "GET",
              undefined,
              f.provider,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await cancel(
              f,
              row,
              intent(row, { executionContext: "FULL_CLAIMED" }),
              who,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await f.call(
              `requests/${row.id}/contact`,
              "GET",
              undefined,
              f.provider,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await f.call(
              `reviews/requests/${row.id}`,
              "POST",
              { rating: 5 },
              f.client,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await (
              await f.call(
                `reviews/requests/${row.id}`,
                "GET",
                undefined,
                f.client,
              )
            ).json()
          ).canReview,
          false,
        );
      }
    const after = await (
      await f.call(`reviews/providers/${f.workspace.id}`)
    ).json();
    assert.deepEqual(after, before);
    assert.equal(f.reviews.rows.size, 1);
    assert.equal((await cancel(f, completed, intent(completed))).status, 409);
  } finally {
    await f.app.close();
  }
});

test("long history keeps every original event and includes structured cancellation on subsequent pages without exposing account IDs", async () => {
  const f = await fixture();
  try {
    let row = await at(f, "IN_PROGRESS");
    for (let i = 0; i < 11; i++) {
      row = await (await f.act(row, "propose-completion")).json();
      row = await (
        await f.act(row, "reopen", f.client, {
          reason: "Ainda falta finalizar uma parte.",
        })
      ).json();
    }
    const original = structuredClone(f.repo.history),
      response = await cancel(f, row, intent(row));
    assert.equal(response.status, 200);
    const result = (await response.json()) as ServiceRequestDetail;
    assert.equal(result.events.length, 20);
    assert.equal(result.eventTotal, row.version + 1);
    assert.deepEqual(f.repo.history.slice(0, -1), original);
    const later = await (
      await f.call(
        `requests/${row.id}/history?afterVersion=20`,
        "GET",
        undefined,
        f.provider,
      )
    ).json();
    assert.equal(later.items.at(-1).reasonCode, "PRICE_DISAGREEMENT");
    assert.equal(later.items.at(-1).executionContext, "PARTIAL");
    const wire = JSON.stringify(later);
    for (const secret of [
      f.client.user.id,
      f.provider.user.id,
      "actorUserId",
      "payloadHash",
      "idempotencyKey",
    ])
      assert.ok(!wire.includes(secret));
  } finally {
    await f.app.close();
  }
});

test("validation errors do not reflect private reasons and Swagger documents confirmation, execution statements and legacy recovery", async () => {
  const f = await fixture();
  try {
    const row = await at(f, "ACCEPTED"),
      reason = "Telefone (48) 99876-5432";
    const response = await cancel(f, row, {
      ...intent(row),
      reasonCode: "OTHER",
      reason,
    });
    assert.equal(response.status, 400);
    const wire = await response.text();
    assert.ok(!wire.includes(reason));
    assert.ok(!wire.includes("99876"));
    const spec = await (await f.call("../docs-json")).json();
    const action = spec.paths["/api/requests/{id}/{action}"].post;
    const schema = action.requestBody.content["application/json"].schema;
    assert.ok(schema.properties.reasonCode.enum.includes("PRICE_DISAGREEMENT"));
    assert.deepEqual(schema.properties.confirmed.enum, [true]);
    assert.ok(schema.properties.executionContext.enum.includes("FULL_CLAIMED"));
    assert.match(action.description, /recuperar recibo/);
  } finally {
    await f.app.close();
  }
});
