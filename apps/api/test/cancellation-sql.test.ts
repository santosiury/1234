import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  cancellationMetadataBatch,
  validateCancellationMigration,
} from "../scripts/cancellation-migration-validation";
const sqlPath =
  "prisma/migrations/20261123000000_unilateral_cancellation/migration.sql";
async function files() {
  return Promise.all([
    readFile("prisma/history/phase25.prisma.snapshot", "utf8"),
    readFile("prisma/history/phase26-cancellation.prisma.snapshot", "utf8"),
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
  const { metadataSql } = cancellationMetadataBatch(sql);
  assert.match(
    metadataSql,
    /\[reasonCode\] IS NOT NULL AND \[action\]=N'cancel'/,
  );
  assert.match(
    metadataSql,
    /\[previousStatus\] IS NOT NULL AND \[previousStatus\] IN \(N'IN_PROGRESS',N'AWAITING_CONFIRMATION'\) AND \[newStatus\]=N'CANCELLED'/,
  );
  assert.match(
    metadataSql,
    /\[executionContext\] IS NOT NULL AND \[executionContext\] IN/,
  );
  assert.match(current, /provider = "sqlserver"/);
  assert.match(
    await readFile("prisma/migrations/migration_lock.toml", "utf8"),
    /provider = "mssql"/,
  );
});
test("metadata CHECK compiles in a nested batch after ADD without changing its original business expression", async () => {
  const [, , , sql] = await files();
  const batch = cancellationMetadataBatch(sql);
  assert.ok(sql.indexOf("ADD [reasonCode]") < batch.index);
  assert.ok(batch.index < sql.indexOf("COMMIT TRANSACTION"));
  assert.doesNotMatch(batch.outerSql, /CHECK \(\s*\(\[reasonCode\]/);
  // Original metadata DDL before the SQL 207 fix, with whitespace normalized.
  // Only quoting/compilation boundaries may change in this repair.
  assert.equal(
    createHash("sha256")
      .update(batch.metadataSql.replace(/\s/g, ""))
      .digest("hex"),
    "ceff00d6a6d3a4c952cabfcfa51c87d9ad23de0414c0d8a0102dc56eb4ae0e3d",
  );
});

test("static checker rejects same-batch column references, GO, early compilation and DDL outside the transaction", async () => {
  const [previous, current, old, sql] = await files();
  const { metadataSql } = cancellationMetadataBatch(sql);
  const invocation = sql.match(
    /EXEC sys\.sp_executesql N'((?:''|[^'])*)';/,
  )![0];
  const add =
    "ALTER TABLE [dbo].[ServiceRequestEvent] ADD [reasonCode] NVARCHAR(40) NULL, [executionContext] NVARCHAR(32) NULL;";
  for (const changed of [
    sql.replace(invocation, metadataSql),
    sql.replace(add, "").replace(invocation, `${invocation}\n${add}`),
    sql
      .replace(invocation, "")
      .replace("COMMIT TRANSACTION;", `COMMIT TRANSACTION;\n${invocation}`),
    sql.replace(add, `${add}\nGO`),
    sql.replace("EXEC sys.sp_executesql N'", "EXEC sys.sp_executesql '"),
    sql.replace("N''cancel''", "N'cancel'"),
    sql.replace(
      invocation,
      `SELECT [reasonCode] FROM [dbo].[ServiceRequestEvent];\n${invocation}`,
    ),
  ])
    await assert.rejects(
      validateCancellationMigration(previous, current, old, changed),
    );
});

test("dynamic quoting cannot hide writes, an untrusted metadata CHECK or missing business codes from static validation", async () => {
  const [previous, current, old, sql] = await files();
  for (const changed of [
    sql.replace(
      "WITH CHECK ADD CONSTRAINT [ServiceRequestEvent_cancellation_metadata_check]",
      "WITH NOCHECK ADD CONSTRAINT [ServiceRequestEvent_cancellation_metadata_check]",
    ),
    sql.replace("N''PRICE_DISAGREEMENT''", "N''UNKNOWN_REASON''"),
    sql.replace("N''DISPUTED''", "N''UNKNOWN_CONTEXT''"),
    sql.replace("\n';", "\nDELETE FROM [dbo].[ServiceRequestEvent];\n';"),
  ])
    await assert.rejects(
      validateCancellationMigration(previous, current, old, changed),
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
