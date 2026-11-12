import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDMMF } from "@prisma/internals";
import { validateInitialMigration } from "../scripts/migration-validation";
test("request SQL is additive, protects terminal dates, history, idempotency and minimum runtime permissions", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const sql = await readFile(
    "prisma/migrations/20261112000000_service_requests/migration.sql",
    "utf8",
  );
  await validateInitialMigration(schema, sql, [
    "ServiceRequest",
    "ServiceRequestEvent",
  ]);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE \[dbo\]\.\[(User|ClientProfile|ProviderProfile|ProviderService|ServiceCategory|ProviderServiceArea)\]/,
  );
  for (const rule of [
    "participants_check",
    "version_check",
    "completion_check",
    "cancellation_check",
    "transition_check",
    "time_check",
  ])
    assert.ok(sql.includes(rule));
  assert.match(
    sql,
    /UNIQUE NONCLUSTERED \(\[actorUserId\], \[idempotencyKey\]\)/,
  );
  assert.match(sql, /UNIQUE NONCLUSTERED \(\[requestId\], \[version\]\)/);
  assert.match(sql, /\[previousStatus\] IS NOT NULL AND/); // SQL CHECK must not accept UNKNOWN for a non-creation event.
  const model = (await getDMMF({ datamodel: schema })).datamodel.models.find(
    (m) => m.name === "ServiceRequest",
  )!;
  for (const name of [
    "clientUserId",
    "providerUserId",
    "providerServiceId",
    "serviceTitleSnapshot",
    "version",
    "completedAt",
  ])
    assert.ok(model.fields.some((f) => f.name === name));
  const grants = await readFile(
    "../../docs/sql/requests-runtime-permissions.sql",
    "utf8",
  );
  assert.match(
    grants,
    /GRANT SELECT, INSERT ON OBJECT::\[dbo\]\.\[ServiceRequestEvent\]/,
  );
  assert.doesNotMatch(
    grants,
    /GRANT[^;]*(?:DELETE|ALTER|CONTROL|db_owner|db_datawriter)/i,
  );
  assert.doesNotMatch(grants, /GRANT[^;]*UPDATE[^;]*ServiceRequestEvent/i);
  const update = grants.match(/GRANT UPDATE[^;]+;/)![0];
  assert.ok(
    !update.includes("clientUserId") &&
      !update.includes("providerId") &&
      !update.includes("description"),
  );
});
