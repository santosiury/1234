import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInitialMigration } from "../scripts/migration-validation";
test("initial SQL agrees with Prisma and rejects destructive/constraint regressions", async () => {
  const schema = await readFile(
    "prisma/history/phase21.prisma.snapshot",
    "utf8",
  );
  const sql = await readFile(
    "prisma/migrations/20261109000000_persistence_foundation/migration.sql",
    "utf8",
  );
  await validateInitialMigration(schema, sql);
  await assert.rejects(
    validateInitialMigration(schema, sql + "\nDROP TABLE [dbo].[User];"),
  );
  await assert.rejects(
    validateInitialMigration(
      schema,
      sql.replace("ON DELETE NO ACTION", "ON DELETE CASCADE"),
    ),
  );
  await assert.rejects(
    validateInitialMigration(
      schema,
      sql.replace("NVARCHAR(254)", "NVARCHAR(25)"),
    ),
  );
  await assert.rejects(
    validateInitialMigration(
      schema,
      sql.replace("UNIQUE NONCLUSTERED ([email])", "NONCLUSTERED ([email])"),
    ),
  );
});
