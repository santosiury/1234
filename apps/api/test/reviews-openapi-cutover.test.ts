import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import {
  PROTECTED_REVIEW_POLICY,
  PROTECTED_REVIEW_POLICY_HEADER,
} from "@omini/shared";
import { ApiError } from "../src/api-error";
import { ReviewPolicyGuard } from "../src/reviews/review-policy.guard";
import { fixture } from "./support/phase25.fixture";
const ctx = (headers: Record<string, string | string[] | undefined>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as ExecutionContext;
test("policy gate preserves pre-migration legacy mode and blocks missing, wrong or duplicate capability headers when enabled", () => {
  assert.equal(
    new ReviewPolicyGuard(
      new ConfigService({ REVIEWS_V2_ENABLED: false }),
    ).canActivate(ctx({})),
    true,
  );
  const guard = new ReviewPolicyGuard(
    new ConfigService({ REVIEWS_V2_ENABLED: true }),
  );
  for (const value of [
    undefined,
    "legacy",
    [PROTECTED_REVIEW_POLICY, PROTECTED_REVIEW_POLICY],
  ])
    assert.throws(
      () =>
        guard.canActivate(
          ctx({ [PROTECTED_REVIEW_POLICY_HEADER.toLowerCase()]: value }),
        ),
      (e: ApiError) =>
        e.getStatus() === 426 && e.code === "REVIEW_CLIENT_UPDATE_REQUIRED",
    );
  assert.equal(
    guard.canActivate(
      ctx({
        [PROTECTED_REVIEW_POLICY_HEADER.toLowerCase()]: PROTECTED_REVIEW_POLICY,
      }),
    ),
    true,
  );
});
test("real protected HTTP route refuses an old client before writes; legacy mode remains documented and disabled reputation stays unavailable", async () => {
  const f = await fixture(false, true);
  try {
    const row = await f.create();
    const result = await f.call(
      `reviews/requests/${row.id}`,
      "POST",
      { rating: 5 },
      f.client,
      { [PROTECTED_REVIEW_POLICY_HEADER]: "legacy" },
    );
    assert.equal(result.status, 426);
    assert.equal((await result.json()).code, "REVIEW_CLIENT_UPDATE_REQUIRED");
    assert.equal(f.protectedReviews.rows.length, 0);
    assert.equal(f.reviews.rows.size, 0);
    assert.equal(
      (
        await f.call(
          `reviews/requests/${row.id}`,
          "POST",
          { rating: 5 },
          undefined,
          { [PROTECTED_REVIEW_POLICY_HEADER]: "legacy" },
        )
      ).status,
      401,
    );
  } finally {
    await f.app.close();
  }
});
test("generated OpenAPI describes protected bidirectional eligibility, deadline, anonymous aggregates, client authorization and errors", async () => {
  const f = await fixture();
  try {
    const spec = SwaggerModule.createDocument(
      f.app,
      new DocumentBuilder().setTitle("Omini").addBearerAuth().build(),
    );
    const post = spec.paths["/api/reviews/requests/{id}"].post!;
    assert.match(post.summary!, /bidirecional/i);
    assert.match(post.description!, /14 dias/);
    assert.match(post.description!, /completedAt/);
    assert.match(post.description!, /comentário opcional privado/);
    for (const status of [201, 400, 401, 404, 409, 426, 429, 503])
      assert.ok(post.responses[status]);
    const conflicts = JSON.stringify(post.responses[409]);
    for (const code of [
      "REVIEW_WINDOW_CLOSED",
      "REVIEW_IMMUTABLE",
      "CONCURRENT_UPDATE",
    ])
      assert.ok(conflicts.includes(code));
    assert.ok(
      JSON.stringify(post.parameters).includes(PROTECTED_REVIEW_POLICY_HEADER),
    );
    const reputation = spec.paths["/api/reputation/requests/{id}/client"].get!;
    assert.match(reputation.description!, /REQUESTED antes do aceite/);
    assert.match(reputation.description!, /prestador original autenticado/);
    assert.match(
      reputation.description!,
      /Estados finais e terceiros recebem 404/,
    );
    const response = JSON.stringify(reputation.responses[200]);
    assert.match(response, /maxItems":0/);
    assert.ok(!response.includes('"authorUserId"'));
    const publicRoute = spec.paths["/api/reviews/providers/{id}"].get!;
    assert.match(publicRoute.description!, /Não expõe autores/);
    const own = spec.paths["/api/reviews/requests/{id}"].get!;
    assert.match(own.description!, /somente seu próprio envio/);
  } finally {
    await f.app.close();
  }
});
