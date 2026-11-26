import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ReviewDirection, ReviewsPage } from "@omini/shared";
import { MemoryAuthRepository } from "./support/memory-auth.repository";
import { MemoryMarketplaceRepository } from "./support/memory-marketplace.repository";
import { MemoryRequestsRepository } from "./support/memory-requests.repository";
import { MemoryProtectedReviewsRepository } from "./support/memory-protected-reviews.repository";

function fixture(direction: ReviewDirection = "CLIENT_TO_PROVIDER") {
  const auth = new MemoryAuthRepository(),
    catalog = new MemoryMarketplaceRepository(auth),
    requests = new MemoryRequestsRepository(auth, catalog);
  const repo = new MemoryProtectedReviewsRepository(requests, auth, catalog);
  const subjectUserId = randomUUID(),
    profile = randomUUID(),
    now = new Date("2026-12-01T12:00:00Z");
  auth.users.set("subject@example.test", {
    user: {
      id: subjectUserId,
      email: "subject@example.test",
      displayName: "Pessoa Teste",
      profiles: { client: true, provider: true },
    },
    passwordHash: "unused-fixture-hash",
    active: true,
  });
  catalog.profiles.set(subjectUserId, {
    id: profile,
    professionalName: "Profissional Teste",
    bio: null,
    isActive: true,
    services: [],
    areas: [],
  });
  const subject = { subjectUserId, direction };
  function add(author = randomUUID(), rating = 4) {
    const id = randomUUID(),
      client = direction === "CLIENT_TO_PROVIDER" ? author : subjectUserId,
      provider = direction === "CLIENT_TO_PROVIDER" ? subjectUserId : author;
    requests.rows.set(id, {
      id,
      clientUserId: client,
      providerUserId: provider,
      providerId: profile,
      providerServiceId: randomUUID(),
      clientNameSnapshot: "Cliente privado",
      providerNameSnapshot: "Prestador privado",
      serviceTitleSnapshot: "Serviço privado",
      status: "COMPLETED",
      description: "Descrição privada",
      city: "Araranguá",
      state: "SC",
      neighborhood: "",
      createdAt: now,
      updatedAt: now,
      acceptedAt: now,
      startedAt: now,
      completionProposedAt: now,
      completedAt: now,
      cancelledAt: null,
      version: 5,
      idempotencyKey: randomUUID(),
    });
    requests.history.push({
      id: randomUUID(),
      requestId: id,
      actorUserId: client,
      previousStatus: "AWAITING_CONFIRMATION",
      newStatus: "COMPLETED",
      action: "confirm-completion",
      occurredAt: now,
      reason: null,
      reasonCode: null,
      executionContext: null,
      version: 5,
      idempotencyKey: randomUUID(),
      payloadHash: "0".repeat(64),
    });
    const review = {
      id: randomUUID(),
      requestId: id,
      direction,
      authorUserId: author,
      subjectUserId,
      rating,
      comment: "Comentário privado",
      submittedAt: now,
      publishedAt: now,
      isLegacy: true,
      batchId: null,
    };
    repo.rows.push(review);
    return review;
  }
  const page = async () =>
    (direction === "CLIENT_TO_PROVIDER"
      ? repo.providerPage(profile, null, 1, 5)
      : repo.clientReputation(subjectUserId)) as Promise<ReviewsPage>;
  const batch = () => repo.transaction((tx) => tx.formBatch(subject));
  return { repo, requests, add, page, batch };
}
const mutations = {
  removed: (f: ReturnType<typeof fixture>) => {
    f.repo.rows.splice(0, 1);
  },
  cancelled: (f: ReturnType<typeof fixture>) => {
    f.requests.rows.get(f.repo.rows[0].requestId)!.status = "CANCELLED";
  },
  completion_missing: (f: ReturnType<typeof fixture>) => {
    f.requests.rows.get(f.repo.rows[0].requestId)!.completedAt = null;
  },
  evidence_missing: (f: ReturnType<typeof fixture>) => {
    f.requests.history.splice(0, 1);
  },
  evidence_stale: (f: ReturnType<typeof fixture>) => {
    f.requests.rows.get(f.repo.rows[0].requestId)!.version++;
  },
  canonical_participant_changed: (f: ReturnType<typeof fixture>) => {
    f.requests.rows.get(f.repo.rows[0].requestId)!.clientUserId = randomUUID();
  },
  unpublished: (f: ReturnType<typeof fixture>) => {
    f.repo.rows[0].publishedAt = null;
  },
};
for (const direction of ["CLIENT_TO_PROVIDER", "PROVIDER_TO_CLIENT"] as const) {
  for (const size of [5, 6, 9]) {
    for (const [name, mutate] of Object.entries(mutations)) {
      test(`${direction}: a ${size}-author cohort is withheld whole after ${name}, never exposing the remaining histogram`, async () => {
        const f = fixture(direction);
        for (let i = 0; i < size; i++) f.add(undefined, (i % 5) + 1);
        await f.batch();
        const before = await f.page();
        assert.equal(before.total, size);
        assert.equal(before.anonymous, true);
        const snapshot = structuredClone({
          rows: f.repo.rows,
          requests: f.requests.rows,
          history: f.requests.history,
        });
        const batchId = f.repo.rows[0].batchId;
        mutate(f);
        await f.batch();
        const after = await f.page();
        assert.equal(after.total, 0);
        assert.equal(after.average, null);
        assert.equal(after.privacyProtected, true);
        assert.deepEqual(after.items, []);
        assert.ok(after.distribution!.every((r) => r.count === 0));
        assert.equal(f.repo.batches.size, 1);
        assert.doesNotMatch(
          JSON.stringify(after),
          /Comentário|requestId|authorUserId|subjectUserId|createdAt|batchId/,
        );
        f.repo.rows = snapshot.rows;
        f.requests.rows = snapshot.requests;
        f.requests.history = snapshot.history;
        assert.deepEqual(await f.page(), before);
        assert.ok(f.repo.rows.every((r) => r.batchId === batchId));
      });
    }
  }
}
test("one invalidated duplicate-author entry hides the whole cohort even when every distinct author remains", async () => {
  const f = fixture();
  const author = randomUUID();
  f.add(author, 1);
  f.add(author, 2);
  for (let i = 0; i < 5; i++) f.add();
  await f.batch();
  assert.equal((await f.page()).total, 7);
  assert.equal([...f.repo.batches.values()][0].distinctAuthorCount, 6);
  f.repo.rows.splice(0, 1);
  assert.equal((await f.page()).total, 0);
});
test("healthy cohorts remain unchanged; a partial cohort is neither counted nor recycled into new cohorts", async () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) f.add(undefined, (i % 5) + 1);
  await f.batch();
  const original = f.repo.rows.map((r) => r.batchId);
  for (let i = 0; i < 5; i++) f.add(undefined, 4);
  await f.batch();
  const before = await f.page();
  assert.equal(before.total, 11);
  f.requests.rows.get(f.repo.rows[0].requestId)!.status = "CANCELLED";
  await f.batch();
  const after = await f.page();
  assert.equal(after.total, 5);
  assert.equal(after.average, 4);
  assert.deepEqual(
    after.distribution!.map((r) => r.count),
    [0, 5, 0, 0, 0],
  );
  assert.equal(before.total - after.total, 6);
  assert.equal(f.repo.batches.size, 2);
  assert.deepEqual(
    f.repo.rows.slice(0, 6).map((r) => r.batchId),
    original,
  );
  f.add(undefined, 1);
  await f.batch();
  assert.deepEqual(await f.page(), after);
});
test("unassigned groups under five authors and inconsistent publication counters never become public", async () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) f.add();
  await f.batch();
  assert.equal(f.repo.batches.size, 0);
  assert.equal((await f.page()).total, 0);
  f.add();
  await f.batch();
  assert.equal((await f.page()).total, 5);
  [...f.repo.batches.values()][0].distinctAuthorCount = 6;
  assert.equal((await f.page()).total, 0);
});
