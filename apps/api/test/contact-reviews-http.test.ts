import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  ServiceRequestDetail,
  PublishedReview,
  ReviewsPage,
} from "@omini/shared";
import { fixture } from "./support/phase25.fixture";
async function complete(f: Awaited<ReturnType<typeof fixture>>) {
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
  }
  return row;
}
test("HTTP contact requires authentication, participant and accepted open status; public projections never leak contact", async () => {
  const f = await fixture();
  try {
    let row = await f.create();
    const path = `requests/${row.id}/contact`;
    assert.equal((await f.call(path)).status, 401);
    assert.equal(
      (await f.call(path, "GET", undefined, f.provider)).status,
      404,
    );
    row = (await (await f.act(row, "accept")).json()) as ServiceRequestDetail;
    assert.equal((await f.call(path, "GET", undefined, f.client)).status, 404);
    assert.equal((await f.call(path, "GET", undefined, f.other)).status, 404);
    const response = await f.call(path, "GET", undefined, f.provider);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      phone: "+5548998765432",
      hasWhatsapp: true,
    });
    for (const [p, t] of [
      [`catalog/providers/${f.workspace.id}`, undefined],
      ["requests/sent", f.client],
      ["requests/received", f.provider],
      [`requests/${row.id}`, f.provider],
    ] as const)
      assert.doesNotMatch(
        await (await f.call(p, "GET", undefined, t)).text(),
        /phone|whatsapp|5548998765432/i,
      );
    await f.call(
      `requests/${row.id}/cancel`,
      "POST",
      {
        version: row.version,
        idempotencyKey: "50000000-0000-4000-8000-000000000001",
        reasonCode: "PRICE_DISAGREEMENT",
        confirmed: true,
      },
      f.client,
    );
    assert.equal(
      (await f.call(path, "GET", undefined, f.provider)).status,
      404,
    );
  } finally {
    await f.app.close();
  }
});
test("legacy client can login and recover a confirmed creation but cannot send a new request before updating contact", async () => {
  const f = await fixture();
  try {
    const input = f.input(),
      created = await f.call("requests", "POST", input, f.client);
    assert.equal(created.status, 201);
    const record = f.auth.users.get(f.client.user.email)!;
    record.user.contactReady = false;
    f.auth.contacts.delete(record.user.id);
    assert.equal(
      (await f.call("auth/me", "GET", undefined, f.client)).status,
      200,
    );
    assert.equal(
      (await f.call("requests/sent", "GET", undefined, f.client)).status,
      200,
    );
    assert.equal(
      (await f.call("requests", "POST", input, f.client)).status,
      201,
    );
    const blocked = await f.call("requests", "POST", f.input(), f.client);
    assert.equal(blocked.status, 400);
    assert.equal((await blocked.json()).code, "CONTACT_REQUIRED");
    const contact = {
      phone: "(48) 99765-4321",
      hasWhatsapp: false,
      shareContact: true,
    };
    assert.equal(
      (
        await f.call(
          "me/contact",
          "PATCH",
          { ...contact, userId: f.other.user.id },
          f.client,
        )
      ).status,
      400,
    );
    const updated = await f.call("me/contact", "PATCH", contact, f.client);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).phone, "+5548997654321");
    assert.equal(
      (await f.call("requests", "POST", f.input(), f.client)).status,
      201,
    );
    assert.equal(
      (await f.call("me/contact", "GET", undefined, f.other)).status,
      200,
    );
    const other = await (
      await f.call("me/contact", "GET", undefined, f.other)
    ).json();
    assert.equal(other.phone, "+5548998765432");
  } finally {
    await f.app.close();
  }
});
test("contact consent withdrawal prevents subsequent provider reads; closed legacy requests reveal no phone", async () => {
  const f = await fixture();
  try {
    const row = await f.create();
    await f.act(row, "accept");
    await f.call(
      "me/contact",
      "PATCH",
      { phone: "+5548998765432", hasWhatsapp: true, shareContact: false },
      f.client,
    );
    assert.equal(
      (await f.call(`requests/${row.id}/contact`, "GET", undefined, f.provider))
        .status,
      404,
    );
    for (const status of ["REJECTED", "CANCELLED", "COMPLETED"]) {
      f.repo.rows.get(row.id)!.status = status;
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
    }
  } finally {
    await f.app.close();
  }
});
test("provider-only account adds contact then a client profile without creating another user", async () => {
  const f = await fixture();
  try {
    const p = await f.login(["provider"]),
      record = f.auth.users.get(p.user.email)!;
    record.user.contactReady = false;
    f.auth.contacts.delete(record.user.id);
    assert.equal(
      (await f.call("auth/profiles", "POST", { role: "client" }, p)).status,
      400,
    );
    await f.call(
      "me/contact",
      "PATCH",
      { phone: "+5548998765432", hasWhatsapp: true, shareContact: true },
      p,
    );
    const added = await f.call("auth/profiles", "POST", { role: "client" }, p);
    assert.equal(added.status, 200);
    const user = await added.json();
    assert.equal(user.id, p.user.id);
    assert.deepEqual(user.profiles, { client: true, provider: true });
  } finally {
    await f.app.close();
  }
});
test("contact endpoint is rate limited independently and never echoes contact in errors", async () => {
  const f = await fixture();
  try {
    let last!: Response;
    for (let i = 0; i < 21; i++)
      last = await f.call("me/contact", "GET", undefined, f.client);
    assert.equal(last.status, 429);
    assert.doesNotMatch(await last.text(), /5548998765432|secret|password/i);
  } finally {
    await f.app.close();
  }
});
test("real review requires original client and completion evidence; rejects every earlier status and auto-review", async () => {
  const f = await fixture();
  try {
    const row = await f.create(),
      path = `reviews/requests/${row.id}`;
    assert.equal((await f.call(path, "POST", { rating: 5 })).status, 401);
    for (const who of [f.other, f.provider])
      assert.equal(
        (await f.call(path, "POST", { rating: 5 }, who)).status,
        404,
      );
    for (const status of [
      "REQUESTED",
      "ACCEPTED",
      "REJECTED",
      "IN_PROGRESS",
      "AWAITING_CONFIRMATION",
      "CANCELLED",
      "COMPLETED",
    ]) {
      f.repo.rows.get(row.id)!.status = status;
      assert.equal(
        (await f.call(path, "POST", { rating: 5 }, f.client)).status,
        404,
      );
    }
    assert.equal(f.reviews.rows.size, 0);
    const finished = await complete(f);
    f.repo.rows.get(finished.id)!.providerUserId = f.client.user.id;
    assert.equal(
      (
        await f.call(
          `reviews/requests/${finished.id}`,
          "POST",
          { rating: 5 },
          f.client,
        )
      ).status,
      404,
    );
  } finally {
    await f.app.close();
  }
});
test("review validates integer range, bounded optional comment, PII, HTML and forbids spoofed author/date", async () => {
  const f = await fixture();
  try {
    const row = await complete(f),
      path = `reviews/requests/${row.id}`;
    for (const input of [
      { rating: 0 },
      { rating: 6 },
      { rating: 1.5 },
      { rating: "5" },
      { rating: 5, comment: "a".repeat(1001) },
      { rating: 5, comment: "Ligue (48) 99876-5432" },
      { rating: 5, comment: "<script>alert(1)</script>" },
      { rating: 5, clientUserId: f.other.user.id },
      { rating: 5, createdAt: "2020-01-01" },
    ])
      assert.equal((await f.call(path, "POST", input, f.client)).status, 400);
    assert.equal(f.reviews.rows.size, 0);
    assert.equal(
      (await f.call(path, "POST", { rating: 1 }, f.client)).status,
      201,
    );
  } finally {
    await f.app.close();
  }
});
test("concurrent identical publications return one immutable review and distinct retry payload cannot replace it", async () => {
  const f = await fixture();
  try {
    const row = await complete(f),
      path = `reviews/requests/${row.id}`,
      before = f.repo.history.length;
    const responses = await Promise.all([
      f.call(
        path,
        "POST",
        { rating: 4, comment: "Atendimento cuidadoso." },
        f.client,
      ),
      f.call(
        path,
        "POST",
        { rating: 4, comment: "Atendimento cuidadoso." },
        f.client,
      ),
    ]);
    const values = (await Promise.all(
      responses.map((r) => r.json()),
    )) as PublishedReview[];
    assert.ok(responses.every((r) => r.status === 201));
    assert.equal(values[0].id, values[1].id);
    assert.equal(f.reviews.rows.size, 1);
    assert.equal(f.repo.history.length, before);
    assert.equal(
      (await f.call(path, "POST", { rating: 2 }, f.client)).status,
      409,
    );
    assert.equal(
      (await f.call(path, "PATCH", { rating: 2 }, f.client)).status,
      404,
    );
    assert.equal(
      (await f.call(path, "DELETE", undefined, f.client)).status,
      404,
    );
    assert.equal((await f.call(path, "GET", undefined, f.other)).status, 404);
    const privateView = await (
      await f.call(path, "GET", undefined, f.client)
    ).json();
    assert.equal(privateView.canReview, false);
    assert.equal(privateView.review.id, values[0].id);
  } finally {
    await f.app.close();
  }
});
test("aggregates and public/owner pagination use only real reviews and expose no contact, email or account/request IDs", async () => {
  const f = await fixture();
  try {
    const path = `reviews/providers/${f.workspace.id}`;
    const empty = (await (await f.call(path)).json()) as ReviewsPage;
    assert.equal(empty.average, null);
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.items, []);
    for (const rating of [4, 5]) {
      const row = await complete(f);
      await f.call(
        `reviews/requests/${row.id}`,
        "POST",
        { rating, comment: rating === 4 ? "Bom atendimento." : null },
        f.client,
      );
    }
    const pub = await f.call(path + "?page=1&pageSize=1"),
      page = (await pub.json()) as ReviewsPage;
    assert.equal(page.average, 4.5);
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    const second = (await (
      await f.call(path + "?page=2&pageSize=1")
    ).json()) as ReviewsPage;
    assert.notEqual(page.items[0].id, second.items[0].id);
    const own = (await (
      await f.call("provider/me/reviews", "GET", undefined, f.provider)
    ).json()) as ReviewsPage;
    assert.equal(own.average, page.average);
    assert.equal(own.total, page.total);
    assert.equal(
      (await f.call("provider/me/reviews", "GET", undefined, f.other)).status,
      404,
    );
    const serialized = JSON.stringify(own);
    for (const value of [
      f.client.user.id,
      f.provider.user.id,
      f.client.user.email,
      "phone",
      "requestId",
      "clientUserId",
    ])
      assert.ok(!serialized.includes(value));
    assert.equal((await f.call(path + "?pageSize=21")).status, 400);
    f.catalog.profiles.get(f.provider.user.id)!.isActive = false;
    assert.equal((await f.call(path)).status, 404);
  } finally {
    await f.app.close();
  }
});
test("later review remains possible from completed history and insert failure leaves old requests/events/categories intact", async () => {
  const f = await fixture();
  try {
    const row = await complete(f),
      path = `reviews/requests/${row.id}`;
    assert.equal(row.canReview, true);
    const original = structuredClone(f.repo.rows.get(row.id)),
      events = structuredClone(f.repo.history),
      categories = structuredClone(f.catalog.categoryRows);
    const invitation = await (
      await f.call(path, "GET", undefined, f.client)
    ).json();
    assert.equal(invitation.canReview, true);
    assert.equal(invitation.review, null);
    f.reviews.failInsert = true;
    const fail = await f.call(path, "POST", { rating: 5 }, f.client);
    assert.equal(fail.status, 503);
    assert.doesNotMatch(await fail.text(), /Private|secret|SQL/);
    assert.equal(f.reviews.rows.size, 0);
    assert.deepEqual(f.repo.rows.get(row.id), original);
    assert.deepEqual(f.repo.history, events);
    assert.deepEqual(f.catalog.categoryRows, categories);
    f.reviews.failInsert = false;
    assert.equal(
      (await f.call(path, "POST", { rating: 5 }, f.client)).status,
      201,
    );
  } finally {
    await f.app.close();
  }
});
