import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateCancellationMigration } from "../scripts/cancellation-migration-validation";
const sqlPath =
  "prisma/migrations/20261123000000_unilateral_cancellation/migration.sql";
async function files() {
  return Promise.all([
    readFile("prisma/history/phase25.prisma.snapshot", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile(
      "prisma/migrations/20261112000000_service_requests/migration.sql",
      "utf8",
    ),
    readFile(sqlPath, "utf8"),
  ]);
}
test("cancellation migration adds only nullable event metadata and expands the trusted transition CHECK transactionally without data writes", async () => {
  const [previous, current, old, sql] = await files();
  await validateCancellationMigration(previous, current, old, sql);
  assert.match(sql, /\[reasonCode\] IS NOT NULL AND \[action\]=N'cancel'/);
  assert.match(
    sql,
    /\[previousStatus\] IS NOT NULL AND \[previousStatus\] IN \(N'IN_PROGRESS',N'AWAITING_CONFIRMATION'\) AND \[newStatus\]=N'CANCELLED'/,
  );
  assert.match(
    sql,
    /\[executionContext\] IS NOT NULL AND \[executionContext\] IN/,
  );
  assert.match(current, /provider = "sqlserver"/);
  assert.match(
    await readFile("prisma/migrations/migration_lock.toml", "utf8"),
    /provider = "mssql"/,
  );
});
test("static checker rejects weakening existing transitions, untrusted constraints, destructive writes and silent loss of rollback", async () => {
  const [previous, current, old, sql] = await files();
  for (const changed of [
    sql.replace("WITH CHECK ADD CONSTRAINT", "WITH NOCHECK ADD CONSTRAINT"),
    sql.replace("[action]=N'confirm-completion'", "[action]=N'cancel'"),
    sql + "\nDELETE FROM [dbo].[ServiceRequestEvent];",
    sql.replace("ROLLBACK TRANSACTION", "SELECT 1"),
    sql.replace(
      "[reasonCode] NVARCHAR(40) NULL",
      "[reasonCode] NVARCHAR(40) NOT NULL",
    ),
  ])
    await assert.rejects(
      validateCancellationMigration(previous, current, old, changed),
    );
});
test("all five executed migrations remain byte-for-byte unchanged and runtime retains table-level append-only event privileges", async () => {
  const expected: Record<string, string> = {
    "20261109000000_persistence_foundation":
      "e2244f55428f92df8d69e2d841b45cb8bb8ef49d9870bd551267c51dc5ccd2ff",
    "20261110000000_authentication":
      "7db13e7699322623a25336fe704fb39c55952c2f5d1006ad0fcb8bb48a634154",
    "20261112000000_service_requests":
      "ebc635b8951712d1d61ea72b1a93c98db7eed24c6410fbd836ef4306e4eb368e",
    "20261115000000_customer_contact":
      "2935b56756ab38f1526ee0c520db4c3a11e953a1dd89308417e2c3a988612a60",
    "20261115010000_service_reviews":
      "4f8ce0a96bbbd530f852b2771cc48fc5d7d56b13b82d6f68abd956ac6cec6782",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const sql = await readFile(
      `prisma/migrations/${name}/migration.sql`,
      "utf8",
    );
    assert.equal(
      createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"),
      hash,
    );
  }
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
  const updates = grants.match(/GRANT UPDATE[^;]+;/)![0];
  for (const field of ["status", "version", "cancelledAt", "updatedAt"])
    assert.ok(updates.includes(`[${field}]`));
});
