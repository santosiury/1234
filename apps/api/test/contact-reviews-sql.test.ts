import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { validateInitialMigration } from "../scripts/migration-validation";
import { PrismaReviewsRepository } from "../src/reviews/prisma-reviews.repository";
import { PrismaContactRepository } from "../src/contact/prisma-contact.repository";
import { PrismaService } from "../src/persistence/prisma.service";
test("incremental review SQL matches Prisma with uniqueness, CHECKs, FK NoAction and runtime INSERT/SELECT only", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8"),
    sql = await readFile(
      "prisma/migrations/20261115010000_service_reviews/migration.sql",
      "utf8",
    );
  await validateInitialMigration(schema, sql, ["ServiceReview"]);
  assert.match(sql, /CHECK \(\[rating\] BETWEEN 1 AND 5\)/);
  assert.match(sql, /CHECK \(\[clientUserId\] <> \[providerUserId\]\)/);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE \[dbo\]\.\[(?:User|ServiceRequest|ServiceRequestEvent|ServiceCategory)\]/,
  );
  const grants = await readFile(
    "../../docs/sql/reviews-runtime-permissions.sql",
    "utf8",
  );
  assert.match(
    grants,
    /GRANT SELECT, INSERT ON OBJECT::\[dbo\]\.\[ServiceReview\] TO \[omini_runtime_role\]/,
  );
  assert.doesNotMatch(
    grants,
    /GRANT[^;]*(?:UPDATE|DELETE|ALTER|CONTROL|db_owner|db_datawriter)/i,
  );
  assert.match(schema, /provider = "sqlserver"/);
  assert.match(
    await readFile("prisma/migrations/migration_lock.toml", "utf8"),
    /provider = "mssql"/,
  );
});
test("contact migration adds opt-in fields without rewriting historical phone, categories or requests and old migrations are unchanged", async () => {
  const sql = await readFile(
    "prisma/migrations/20261115000000_customer_contact/migration.sql",
    "utf8",
  );
  assert.match(
    sql,
    /ALTER TABLE \[dbo\]\.\[User\] ADD \[hasWhatsapp\] BIT NOT NULL/,
  );
  assert.match(sql, /\[phoneShareConsentedAt\] DATETIME2 NULL/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE|MERGE)\b/i);
  const original = await readFile(
    "prisma/migrations/20261109000000_persistence_foundation/migration.sql",
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(original.replace(/\r\n/g, "\n")).digest("hex"),
    "e2244f55428f92df8d69e2d841b45cb8bb8ef49d9870bd551267c51dc5ccd2ff",
  );
  const grants = await readFile(
    "../../docs/sql/contact-runtime-permissions.sql",
    "utf8",
  );
  assert.doesNotMatch(
    grants,
    /GRANT[^;]*(?:INSERT|DELETE|ALTER|CONTROL|db_owner|db_datawriter)/i,
  );
  assert.match(
    grants,
    /GRANT UPDATE \(\[phone\], \[hasWhatsapp\], \[phoneShareConsentedAt\]\)/,
  );
});
function service(db: unknown) {
  const p = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("no SQL");
    },
  );
  p.orm = () =>
    ({
      $transaction: async (
        run: (tx: unknown) => Promise<unknown>,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, "Serializable");
        return run(db);
      },
    }) as unknown as PrismaClient;
  return p;
}
test("SQL Server reputation binds IDs/pagination, casts AVG to decimal and uses the same audited valid set for summary and items", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const repo = new PrismaReviewsRepository(
    service({
      providerProfile: { findFirst: async () => ({ id: "provider' OR 1=1" }) },
      $queryRaw: async (query: { strings: string[]; values: unknown[] }) => {
        calls.push({ sql: query.strings.join("?"), values: query.values });
        return calls.length === 1
          ? [
              {
                total: 2,
                average: "4.5000",
                one: 0,
                two: 0,
                three: 0,
                four: 1,
                five: 1,
              },
            ]
          : [
              {
                id: "review",
                rating: 4,
                comment: null,
                createdAt: new Date("2026-11-15T12:00:00Z"),
              },
            ];
      },
    }),
  );
  const page = await repo.page("id", null, 2, 5);
  assert.equal(page?.average, 4.5);
  assert.equal(page?.total, 2);
  assert.deepEqual(page?.distribution, [
    { stars: 5, count: 1 },
    { stars: 4, count: 1 },
    { stars: 3, count: 0 },
    { stars: 2, count: 0 },
    { stars: 1, count: 0 },
  ]);
  for (let rating = 1; rating <= 5; rating++)
    assert.ok(calls[0].sql.includes(`CASE WHEN v.[rating]=${rating}`));
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.ok(!c.sql.includes("provider' OR 1=1"));
    assert.ok(c.values.includes("provider' OR 1=1"));
    assert.match(c.sql, /EXISTS.*ServiceRequestEvent/s);
    assert.match(c.sql, /r\.\[clientUserId\]=v\.\[clientUserId\]/);
    assert.match(c.sql, /r\.\[providerUserId\]=v\.\[providerUserId\]/);
  }
  assert.match(calls[0].sql, /AVG\(CAST\(v\.\[rating\] AS DECIMAL\(10,4\)\)\)/);
  assert.match(
    calls[1].sql,
    /ORDER BY v\.\[createdAt\] DESC, v\.\[id\] DESC OFFSET/,
  );
  assert.ok(calls[1].values.includes(5));
  assert.doesNotMatch(
    JSON.stringify(page),
    /providerUserId|clientUserId|requestId|phone|email/,
  );
});
test("Prisma private contact fetch returns only consented active client contact and current owner/status under Serializable", async () => {
  let consent: Date | null = new Date();
  const repo = new PrismaContactRepository(
    service({
      serviceRequest: {
        findUnique: async () => ({
          providerUserId: "owner",
          status: "ACCEPTED",
          provider: { isActive: true, user: { id: "owner", isActive: true } },
          client: {
            phone: "+5548998765432",
            hasWhatsapp: true,
            phoneShareConsentedAt: consent,
            isActive: true,
          },
        }),
      },
    }),
  );
  assert.deepEqual((await repo.request("request"))?.contact, {
    phone: "+5548998765432",
    hasWhatsapp: true,
  });
  consent = null;
  assert.equal((await repo.request("request"))?.contact, null);
});
