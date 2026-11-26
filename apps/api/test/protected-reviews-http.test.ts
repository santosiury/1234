import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  AuthTokens,
  ServiceRequestDetail,
  RequestReview,
} from "@omini/shared";
import { fixture } from "./support/phase25.fixture";
async function complete(
  f: Awaited<ReturnType<typeof fixture>>,
  who: AuthTokens = f.client,
) {
  const response = await f.call("requests", "POST", f.input(), who);
  assert.equal(response.status, 201);
  let row = (await response.json()) as ServiceRequestDetail;
  for (const action of [
    "accept",
    "start",
    "propose-completion",
    "confirm-completion",
  ] as const) {
    const r = await f.act(
      row,
      action,
      action === "confirm-completion" ? who : f.provider,
    );
    assert.equal(r.status, 200);
    row = (await r.json()) as ServiceRequestDetail;
  }
  return row;
}
test("protected HTTP: both directions, sealed own receipts, immutable idempotency and atomic mutual release", async () => {
  const f = await fixture(false, true);
  try {
    const row = await complete(f);
    f.protectedReviews.open(row.id);
    const path = `reviews/requests/${row.id}`;
    assert.equal((await f.call(path)).status, 401);
    assert.equal((await f.call(path, "GET", undefined, f.other)).status, 404);
    for (const actor of [f.client, f.provider]) {
      const info = (await (
        await f.call(path, "GET", undefined, actor)
      ).json()) as RequestReview;
      assert.equal(info.canReview, true);
      assert.equal(info.protected, true);
      assert.ok(info.closesAt);
    }
    const body = { rating: 4, comment: "Atendimento cuidadoso" };
    const created = await f.call(path, "POST", body, f.client);
    assert.equal(created.status, 201);
    const own = await created.json();
    assert.equal(own.protected, true);
    assert.doesNotMatch(
      JSON.stringify(own),
      /publishedAt|batchId|requestId|authorUserId|subjectUserId|clientName|providerName/,
    );
    assert.equal(f.protectedReviews.rows[0].publishedAt, null);
    f.repo.rows.get(row.id)!.reviewEligible = true;
    f.repo.rows.get(row.id)!.protectedReviews = {
      closesAt: f.protectedReviews.windows.get(row.id)!.closesAt,
      authors: [f.client.user.id],
    };
    for (const actor of [f.client, f.provider]) {
      const detail = await (
        await f.call(`requests/${row.id}`, "GET", undefined, actor)
      ).json();
      assert.equal(detail.reviewSubmitted, actor === f.client);
      assert.equal(detail.canReview, actor === f.provider);
      assert.equal(detail.protectedReviews, undefined);
    }

    const peer = (await (
      await f.call(path, "GET", undefined, f.provider)
    ).json()) as RequestReview;
    assert.equal(peer.review, null);
    assert.equal(peer.canReview, true);
    const replay = await f.call(path, "POST", body, f.client);
    assert.deepEqual(await replay.json(), own);
    assert.equal(
      (await f.call(path, "POST", { rating: 3 }, f.client)).status,
      409,
    );
    assert.equal(
      (await f.call(path, "POST", { rating: 5 }, f.provider)).status,
      201,
    );
    assert.equal(f.protectedReviews.rows.length, 2);
    assert.ok(f.protectedReviews.rows.every((r) => r.publishedAt));
    assert.ok(f.protectedReviews.windows.get(row.id)?.releasedAt);
    // A small sample never reveals whether either participant submitted.
    const publicResponse = await f.call(`reviews/providers/${f.workspace.id}`);
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    const reputation = await publicResponse.json();
    assert.equal(reputation.privacyProtected, true);
    assert.equal(reputation.total, 0);
    assert.deepEqual(reputation.items, []);
    assert.doesNotMatch(
      JSON.stringify(reputation),
      /Atendimento|createdAt|submittedAt|requestId|authorLabel|UserId/,
    );
  } finally {
    await f.app.close();
  }
});
test("protected HTTP: one submission releases at exact day 14, new submissions close, identical replay survives expiration", async () => {
  const f = await fixture(false, true);
  try {
    const row = await complete(f);
    f.protectedReviews.open(row.id);
    const path = `reviews/requests/${row.id}`,
      body = { rating: 2 };
    assert.equal((await f.call(path, "POST", body, f.provider)).status, 201);
    const w = f.protectedReviews.windows.get(row.id)!;
    f.protectedReviews.now = new Date(w.closesAt.getTime() - 1);
    assert.equal(
      (await (await f.call(path, "GET", undefined, f.client)).json()).canReview,
      true,
    );
    f.protectedReviews.now = new Date(w.closesAt);
    const closed = await f.call(path, "POST", { rating: 4 }, f.client);
    assert.equal(closed.status, 409);
    assert.equal((await closed.json()).code, "REVIEW_WINDOW_CLOSED");
    assert.ok(f.protectedReviews.rows[0].publishedAt);
    assert.equal((await f.call(path, "POST", body, f.provider)).status, 201);
    assert.equal(f.protectedReviews.rows.length, 1);
    assert.equal(
      (await (await f.call(path, "GET", undefined, f.client)).json()).canReview,
      false,
    );
  } finally {
    await f.app.close();
  }
});
test("protected HTTP: no retroactive reviews, historical author receipt preserved without disclosure to counterpart", async () => {
  const f = await fixture(false, true);
  try {
    const row = await complete(f),
      path = `reviews/requests/${row.id}`;
    for (const actor of [f.client, f.provider]) {
      assert.equal(
        (await (await f.call(path, "GET", undefined, actor)).json()).canReview,
        false,
      );
      assert.equal(
        (await f.call(path, "POST", { rating: 5 }, actor)).status,
        409,
      );
    }
    const legacy = {
      id: randomUUID(),
      requestId: row.id,
      direction: "CLIENT_TO_PROVIDER",
      authorUserId: f.client.user.id,
      subjectUserId: f.provider.user.id,
      rating: 3,
      comment: "Histórico preservado",
      submittedAt: new Date(row.completedAt!),
      publishedAt: new Date(row.completedAt!),
      isLegacy: true,
      batchId: null,
    };
    f.protectedReviews.rows.push(legacy);
    assert.equal(
      (await (await f.call(path, "GET", undefined, f.client)).json()).review
        .comment,
      legacy.comment,
    );
    assert.equal(
      (await (await f.call(path, "GET", undefined, f.provider)).json()).review,
      null,
    );
    assert.equal(
      (
        await f.call(
          path,
          "POST",
          { rating: 3, comment: legacy.comment },
          f.client,
        )
      ).status,
      201,
    );
    assert.equal(f.protectedReviews.rows.length, 1);
    f.protectedReviews.rows[0].authorUserId = f.other.user.id;
    assert.equal((await f.call(path, "GET", undefined, f.client)).status, 404);
  } finally {
    await f.app.close();
  }
});
test("protected HTTP: invalid payloads, cancelled/foreign/self/incomplete requests never acquire reviews", async () => {
  const f = await fixture(false, true);
  try {
    const row = await complete(f);
    f.protectedReviews.open(row.id);
    const path = `reviews/requests/${row.id}`;
    for (const body of [
      { rating: 0 },
      { rating: 6 },
      { rating: 1.5 },
      { rating: "5" },
      { rating: 4, authorUserId: f.provider.user.id },
      { rating: 4, direction: "PROVIDER_TO_CLIENT" },
      { rating: 4, comment: "x".repeat(1001) },
      { rating: 4, comment: "meu e-mail pessoa@example.test" },
    ])
      assert.equal((await f.call(path, "POST", body, f.client)).status, 400);
    assert.equal(
      (await f.call(path, "POST", { rating: 5 }, f.other)).status,
      404,
    );
    for (const status of [
      "CANCELLED",
      "REQUESTED",
      "IN_PROGRESS",
      "AWAITING_CONFIRMATION",
      "REJECTED",
    ]) {
      f.repo.rows.get(row.id)!.status = status;
      assert.equal(
        (await f.call(path, "POST", { rating: 5 }, f.client)).status,
        404,
      );
    }
    f.repo.rows.get(row.id)!.status = "COMPLETED";
    f.repo.rows.get(row.id)!.providerUserId = f.client.user.id;
    assert.equal(
      (await f.call(path, "POST", { rating: 5 }, f.client)).status,
      404,
    );
    assert.equal(f.protectedReviews.rows.length, 0);
  } finally {
    await f.app.close();
  }
});
test("client reputation: only the original active provider with an open received request, including before acceptance", async () => {
  const f = await fixture(false, true);
  try {
    const row = await f.create(),
      path = `reputation/requests/${row.id}/client`;
    assert.equal((await f.call(path)).status, 401);
    assert.equal((await f.call(path, "GET", undefined, f.client)).status, 404);
    assert.equal((await f.call(path, "GET", undefined, f.other)).status, 404);
    assert.equal(
      (await f.call(path, "GET", undefined, f.provider)).status,
      200,
    );
    assert.equal(
      (await f.call("reputation/me/client", "GET", undefined, f.client)).status,
      200,
    );
    assert.equal(
      (
        await f.call(
          `reputation/requests/${randomUUID()}/client`,
          "GET",
          undefined,
          f.provider,
        )
      ).status,
      404,
    );
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"]) {
      f.repo.rows.get(row.id)!.status = status;
      assert.equal(
        (await f.call(path, "GET", undefined, f.provider)).status,
        404,
      );
    }
  } finally {
    await f.app.close();
  }
});
test("five distinct authors unlock an anonymous cohort; a sixth score cannot change a published aggregate alone", async () => {
  const f = await fixture(false, true);
  try {
    for (let i = 0; i < 5; i++) {
      const client = i ? await f.login() : f.client,
        row = await complete(f, client);
      f.protectedReviews.open(row.id);
      assert.equal(
        (
          await f.call(
            `reviews/requests/${row.id}`,
            "POST",
            { rating: i + 1 },
            client,
          )
        ).status,
        201,
      );
      f.protectedReviews.now = new Date(
        f.protectedReviews.windows.get(row.id)!.closesAt,
      );
      await f.app
        .get(
          (await import("../src/reviews/protected-reviews.service"))
            .ProtectedReviewsService,
        )
        .publishDue();
    }
    const path = `reviews/providers/${f.workspace.id}`,
      rep = await (await f.call(path)).json();
    assert.equal(rep.total, 5);
    assert.equal(rep.average, 3);
    assert.equal(rep.anonymous, true);
    assert.deepEqual(rep.items, []);
    assert.deepEqual(
      rep.distribution.map((x: { count: number }) => x.count),
      [1, 1, 1, 1, 1],
    );
    const row = await complete(f);
    f.protectedReviews.open(row.id);
    await f.call(`reviews/requests/${row.id}`, "POST", { rating: 1 }, f.client);
    f.protectedReviews.now = new Date(
      f.protectedReviews.windows.get(row.id)!.closesAt,
    );
    await f.app
      .get(
        (await import("../src/reviews/protected-reviews.service"))
          .ProtectedReviewsService,
      )
      .publishDue();
    assert.deepEqual(await (await f.call(path)).json(), rep);
  } finally {
    await f.app.close();
  }
});
test("concurrent same-direction requests remain one immutable submission", async () => {
  const f = await fixture(false, true);
  try {
    const row = await complete(f);
    f.protectedReviews.open(row.id);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        f.call(`reviews/requests/${row.id}`, "POST", { rating: 4 }, f.client),
      ),
    );
    assert.ok(results.every((r) => r.status === 201));
    assert.equal(f.protectedReviews.rows.length, 1);
    const bodies = await Promise.all(results.map((r) => r.json()));
    assert.deepEqual(bodies[0], bodies[1]);
  } finally {
    await f.app.close();
  }
});

test("five jobs by one author remain suppressed; disabled mode does not activate client reputation", async () => {
  const f = await fixture(false, true);
  try {
    for (let i = 0; i < 5; i++) {
      const row = await complete(f);
      f.protectedReviews.open(row.id);
      assert.equal(
        (
          await f.call(
            `reviews/requests/${row.id}`,
            "POST",
            { rating: 5 },
            f.client,
          )
        ).status,
        201,
      );
      f.protectedReviews.now = new Date(
        f.protectedReviews.windows.get(row.id)!.closesAt,
      );
      await f.app
        .get(
          (await import("../src/reviews/protected-reviews.service"))
            .ProtectedReviewsService,
        )
        .publishDue();
    }
    assert.equal(f.protectedReviews.rows.length, 5);
    const rep = await (
      await f.call(`reviews/providers/${f.workspace.id}`)
    ).json();
    assert.equal(rep.privacyProtected, true);
    assert.equal(rep.total, 0);
  } finally {
    await f.app.close();
  }
  const disabled = await fixture();
  try {
    assert.equal(
      (
        await disabled.call(
          "reputation/me/client",
          "GET",
          undefined,
          disabled.client,
        )
      ).status,
      404,
    );
  } finally {
    await disabled.app.close();
  }
});
