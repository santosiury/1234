import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareParticipantReview,
  assertParticipantReviewReplay,
  type ParticipantReviewContext,
} from "../src/reviews/participant-review";
import { ApiError } from "../src/api-error";
const client = "10000000-0000-4000-8000-00000000000a",
  provider = "10000000-0000-4000-8000-00000000000b";
function context(): ParticipantReviewContext {
  const now = new Date("2026-12-01T12:00:00Z");
  return {
    accountActive: true,
    clientProfileActive: true,
    providerProfileActive: true,
    request: {
      id: "request",
      clientUserId: client,
      providerUserId: provider,
      providerId: "profile",
      providerServiceId: "service",
      clientNameSnapshot: "Private Client",
      providerNameSnapshot: "Private Provider",
      serviceTitleSnapshot: "Private Service",
      status: "COMPLETED",
      description: "private",
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
      idempotencyKey: "key",
      validCompletion: true,
    },
  };
}
for (const actor of [client, provider])
  test(`server derives direction and canonical identities for ${actor.slice(-1)} including UUID case normalization`, () => {
    const next = prepareParticipantReview(context(), actor.toUpperCase(), {
      rating: 3,
      comment: "  experiência cuidadosa  ",
    });
    assert.equal(next.authorUserId, actor);
    assert.equal(next.subjectUserId, actor === client ? provider : client);
    assert.equal(
      next.direction,
      actor === client ? "CLIENT_TO_PROVIDER" : "PROVIDER_TO_CLIENT",
    );
    assert.equal(next.comment, "experiência cuidadosa");
    assertParticipantReviewReplay(
      { ...next, authorUserId: actor.toUpperCase() },
      next,
    );
    assert.throws(
      () => assertParticipantReviewReplay({ ...next, rating: 4 }, next),
      (e: ApiError) => e.code === "REVIEW_IMMUTABLE",
    );
  });
test("missing completion evidence, inactive accounts/profiles and other participants cannot prepare a review", () => {
  const base = context();
  for (const bad of [
    { ...base, accountActive: false },
    { ...base, clientProfileActive: false },
    { ...base, request: { ...base.request, validCompletion: false } },
    { ...base, request: { ...base.request, completedAt: null } },
    { ...base, request: { ...base.request, providerUserId: client } },
  ])
    assert.throws(
      () => prepareParticipantReview(bad, client, { rating: 5 }),
      (e: ApiError) => e.getStatus() === 404,
    );
  assert.throws(() =>
    prepareParticipantReview(
      { ...base, providerProfileActive: false },
      provider,
      { rating: 5 },
    ),
  );
  assert.throws(() =>
    prepareParticipantReview(base, "third party", { rating: 5 }),
  );
});
