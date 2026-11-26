import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@prisma/client";
import { validateProtectedReviewsMigration } from "../scripts/protected-reviews-migration-validation";
import { PrismaService } from "../src/persistence/prisma.service";
import { PrismaProtectedReviewsRepository } from "../src/reviews/prisma-protected-reviews.repository";
import { PrismaRequestsRepository } from "../src/requests/prisma-requests.repository";
import { validateEnvironment } from "../src/config";
import { ReviewPublisher } from "../src/reviews/review-publisher";
import type { ProtectedReviewsService } from "../src/reviews/protected-reviews.service";
import type { NewEvent } from "../src/requests/requests.repository";
function fake(db: unknown) {
  const prisma = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No SQL permitted");
    },
  );
  prisma.orm = () =>
    ({
      $transaction: async (
        run: (tx: unknown) => unknown,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, "Serializable");
        return run(db);
      },
    }) as unknown as PrismaClient;
  return prisma;
}
test("protected migration is additive with historical scalar/index preservation, isolated port, legacy copy and fail-closed trigger", async () => {
  const previous = await readFile(
      "prisma/history/phase26-cancellation.prisma.snapshot",
      "utf8",
    ),
    current = await readFile("prisma/schema.prisma", "utf8"),
    sql = await readFile(
      "prisma/migrations/20261124000000_bidirectional_reviews/migration.sql",
      "utf8",
    );
  await validateProtectedReviewsMigration(previous, current, sql);
  for (const change of [
    sql + "\nGO",
    sql.replace("<> 15433 THROW", "<> 1433 THROW"),
    sql.replace("DATEADD(DAY,14", "DATEADD(DAY,15"),
    sql.replace("[distinctAuthorCount]>=5", "[distinctAuthorCount]>=1"),
    sql.replace("INSTEAD OF INSERT", "AFTER INSERT"),
    sql.replace(
      "[id], [requestId], N''CLIENT_TO_PROVIDER''",
      "NEWID(), [requestId], N''CLIENT_TO_PROVIDER''",
    ),
  ])
    await assert.rejects(() =>
      validateProtectedReviewsMigration(previous, current, change),
    );
});
test("new runtime permissions allow only SELECT/INSERT and publication columns, never rating or identity updates", async () => {
  const sql = await readFile(
    "../../docs/sql/protected-reviews-runtime-permissions.sql",
    "utf8",
  );
  assert.match(sql, /<> 15433 THROW/);
  assert.match(
    sql,
    /GRANT UPDATE ON OBJECT::\[dbo\]\.\[ParticipantReview\] \(\[publishedAt\], \[batchId\]\)/,
  );
  for (const statement of sql.match(/GRANT[^;]+;/g) ?? [])
    assert.doesNotMatch(
      statement,
      /DELETE|ALTER|CONTROL|db_owner|db_datawriter|\[rating\]|\[comment\]|\[authorUserId\]/i,
    );
});
test("all six historical SQL migrations remain byte-for-byte at approved hashes", async () => {
  const manifest = JSON.parse(
    await readFile("prisma/history/phase26-migration-hashes.json", "utf8"),
  ) as Record<string, string>;
  assert.equal(Object.keys(manifest).length, 6);
  for (const [path, hash] of Object.entries(manifest))
    assert.equal(
      createHash("sha256")
        .update((await readFile(path, "utf8")).replace(/\r\n/g, "\n"))
        .digest("hex"),
      hash,
    );
});
test("protected API activation rejects main port, unknown hosts/users, production and wrong API port without exposing secrets", () => {
  const base = {
    REVIEWS_V2_ENABLED: "true",
    AUTH_ENABLED: "true",
    PERSISTENCE_ENABLED: "true",
    PORT: "3001",
    JWT_ACCESS_SECRET: "x".repeat(64),
    DATABASE_URL:
      "sqlserver://127.0.0.1:15433;database=OminiDB;user=omini_app;password={fixture-only};encrypt=true;trustServerCertificate=true",
  };
  assert.equal(validateEnvironment(base).REVIEWS_V2_ENABLED, true);
  for (const env of [
    { ...base, PORT: "3000" },
    { ...base, NODE_ENV: "production" },
    { ...base, AUTH_ENABLED: "false" },
    ...[
      ["15433", "1433"],
      ["127.0.0.1", "localhost"],
      ["OminiDB", "Other"],
      ["omini_app", "omini_migrator"],
    ].map(([a, b]) => ({
      ...base,
      DATABASE_URL: base.DATABASE_URL.replace(a, b),
    })),
  ])
    assert.throws(
      () => validateEnvironment(env),
      (e: Error) =>
        !e.message.includes("fixture-only") &&
        !e.message.includes("sqlserver://"),
    );
  assert.equal(validateEnvironment({}).REVIEWS_V2_ENABLED, false);
});
test("anonymous SQL uses canonical completed set, distinct author cohorts, decimal mean and bound IDs; no individual metadata", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const repo = new PrismaProtectedReviewsRepository(
    fake({
      providerProfile: { findFirst: async () => ({ userId: "id' injection" }) },
      $queryRaw: async (q: { strings: string[]; values: unknown[] }) => {
        calls.push({ sql: q.strings.join("?"), values: q.values });
        return [
          {
            total: 5,
            average: "3.4",
            one: 1,
            two: 0,
            three: 1,
            four: 2,
            five: 1,
          },
        ];
      },
    }),
  );
  const result = await repo.providerPage("provider", null, 1, 5);
  assert.equal(result?.average, 3.4);
  assert.equal(result?.anonymous, true);
  assert.deepEqual(result?.items, []);
  assert.equal(calls.length, 1);
  const q = calls[0];
  assert.match(q.sql, /HAVING b\.\[distinctAuthorCount\]>=/);
  assert.match(
    q.sql,
    /JOIN \[dbo\]\.\[ParticipantReview\] m ON m\.\[batchId\]=b\.\[id\]/,
  );
  assert.match(q.sql, /LEFT JOIN valid eligible/);
  assert.match(q.sql, /COUNT\(\*\)=b\.\[entryCount\]/);
  assert.match(q.sql, /COUNT\(eligible\.\[id\]\)=b\.\[entryCount\]/);
  assert.match(
    q.sql,
    /COUNT\(DISTINCT m\.\[authorUserId\]\)=b\.\[distinctAuthorCount\]/,
  );
  assert.match(
    q.sql,
    /COUNT\(DISTINCT eligible\.\[authorUserId\]\)=b\.\[distinctAuthorCount\]/,
  );
  assert.match(q.sql, /ROUND\(AVG\(CAST/);
  assert.match(q.sql, /confirm-completion/);
  assert.match(q.sql, /r\.\[status\]=N'COMPLETED'/);
  assert.match(q.sql, /e\.\[occurredAt\]=r\.\[completedAt\]/);
  assert.ok(q.values.includes(5));
  assert.ok(q.values.includes("id' injection"));
  assert.ok(!q.sql.includes("id' injection"));
  assert.doesNotMatch(q.sql, /v\.\[comment\]|v\.\[submittedAt\]/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /authorUserId|subjectUserId|requestId|comment|createdAt|batchId/,
  );
});
test("request-scoped client reputation checks original recipient, active profiles and open statuses before querying aggregates", async () => {
  let selected: unknown;
  let queries = 0;
  const repo = new PrismaProtectedReviewsRepository(
    fake({
      serviceRequest: {
        findFirst: async (q: unknown) => {
          selected = q;
          return null;
        },
      },
      $queryRaw: async () => {
        queries++;
        throw Error("must not run");
      },
    }),
  );
  assert.equal(await repo.clientReputation("actor", "request"), null);
  assert.equal(queries, 0);
  const s = JSON.stringify(selected);
  assert.match(s, /providerUserId.*actor/);
  assert.match(s, /REQUESTED/);
  assert.doesNotMatch(s, /CANCELLED|COMPLETED|REJECTED/);
  assert.match(s, /isActive/);
});
test("confirm-completion opens the 14-day window inside the existing transaction only when enabled; cancellation opens none", async () => {
  const windows: unknown[] = [];
  const event = {
    requestId: "request",
    occurredAt: new Date("2026-12-01T12:00:00Z"),
    action: "confirm-completion",
    newStatus: "COMPLETED",
    previousStatus: "AWAITING_CONFIRMATION",
  } as NewEvent;
  const prisma = fake({
    serviceRequestEvent: {
      create: async ({ data }: { data: unknown }) => data,
    },
    reviewWindow: {
      create: async ({ data }: { data: unknown }) => {
        windows.push(data);
        return data;
      },
    },
  });
  for (const enabled of [false, true]) {
    const repo = new PrismaRequestsRepository(
      prisma,
      new ConfigService({ REVIEWS_V2_ENABLED: enabled }),
    );
    await repo.transaction((tx) => tx.append(event));
    await repo.transaction((tx) =>
      tx.append({ ...event, action: "cancel", newStatus: "CANCELLED" }),
    );
  }
  assert.deepEqual(windows, [
    {
      requestId: "request",
      completedAt: event.occurredAt,
      closesAt: new Date("2026-12-15T12:00:00Z"),
    },
  ]);
});
test("publisher skips disabled mode, avoids overlapping runs and retries on a later tick without leaking raw failures", async () => {
  let enabled = false,
    calls = 0,
    release = () => {};
  const service = {
    get enabled() {
      return enabled;
    },
    publishDue: async () => {
      calls++;
      await new Promise<void>((r) => {
        release = r;
      });
    },
  } as unknown as ProtectedReviewsService;
  const job = new ReviewPublisher(service);
  await job.tick();
  assert.equal(calls, 0);
  enabled = true;
  const pending = job.tick();
  await job.tick();
  assert.equal(calls, 1);
  release();
  await pending;
  job.onModuleDestroy();
});

test("Prisma stores checked database UTC as submission time and locks the same request/window before accessing a direction slot", async () => {
  const calls: string[] = [];
  const submittedAt = new Date("2026-12-01T12:00:00Z");
  let inserted: unknown;
  const repo = new PrismaProtectedReviewsRepository(
    fake({
      $queryRaw: async (q: TemplateStringsArray) => {
        calls.push(q.join("?"));
        return [];
      },
      participantReview: {
        create: async ({ data }: { data: unknown }) => {
          inserted = data;
          return data;
        },
      },
    }),
  );
  await repo.transaction(async (tx) => {
    assert.equal(await tx.window("request"), null);
    await tx.insert(
      {
        requestId: "request",
        direction: "CLIENT_TO_PROVIDER",
        authorUserId: "client",
        subjectUserId: "provider",
        rating: 4,
        comment: null,
      },
      submittedAt,
    );
  });
  assert.ok(calls.every((s) => s.includes("UPDLOCK,HOLDLOCK")));
  assert.match(calls[0], /ServiceRequest/);
  assert.match(calls[1], /ReviewWindow/);
  assert.equal((inserted as { submittedAt: Date }).submittedAt, submittedAt);
});

test("cohort assignment checks affected rows and fails the transaction instead of publishing partial membership", async () => {
  let created: unknown,
    sql = "";
  const repo = new PrismaProtectedReviewsRepository(
    fake({
      $queryRaw: async (q: TemplateStringsArray | { strings: string[] }) =>
        ("strings" in q ? q.strings.join("") : q.join("")).includes("COUNT(*)")
          ? [{ total: 6, authors: 6 }]
          : [{ id: "subject" }],
      reputationBatch: {
        create: async ({ data }: { data: unknown }) => {
          created = data;
          return { id: "batch" };
        },
      },
      $executeRaw: async (q: { strings: string[] }) => {
        sql = q.strings.join("?");
        return 5;
      },
    }),
  );
  await assert.rejects(
    () =>
      repo.transaction((tx) =>
        tx.formBatch({
          subjectUserId: "subject",
          direction: "CLIENT_TO_PROVIDER",
        }),
      ),
    /Incomplete reputation cohort assignment/,
  );
  assert.deepEqual(created, {
    subjectUserId: "subject",
    direction: "CLIENT_TO_PROVIDER",
    entryCount: 6,
    distinctAuthorCount: 6,
  });
  assert.match(sql, /v\.\[batchId\] IS NULL/);
});

test("preflight, post-migration consistency and runtime permission checks are read-only and hard-guarded to OminiDB TCP 15433", async () => {
  for (const name of [
    "protected-reviews-preflight.sql",
    "protected-reviews-consistency.sql",
    "protected-reviews-runtime-check.sql",
  ]) {
    const sql = await readFile(`../../docs/sql/${name}`, "utf8");
    assert.match(sql, /DB_NAME\(\) <> N'OminiDB'/);
    assert.match(sql, /<> 15433 THROW/);
    assert.doesNotMatch(
      sql,
      /^\s*(?:INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|EXEC|GRANT|REVOKE|DENY|BACKUP|RESTORE)\b/im,
    );
    assert.doesNotMatch(sql, /^\s*GO\s*$/im);
  }
  const post = await readFile(
    "../../docs/sql/protected-reviews-consistency.sql",
    "utf8",
  );
  assert.match(post, /CONVERT\(VARBINARY\(MAX\),comment\)/);
  assert.match(post, /EXCEPT/);
  assert.match(post, /is_not_trusted/);
  const runtime = await readFile(
    "../../docs/sql/protected-reviews-runtime-check.sql",
    "utf8",
  );
  assert.match(runtime, /ORIGINAL_LOGIN\(\) <> N'omini_app'/);
  assert.match(runtime, /N'rating',0/);
  assert.match(runtime, /N'publishedAt',1/);
});
