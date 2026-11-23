import assert from "node:assert/strict";
import { getDMMF } from "@prisma/internals";
import {
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLATION_REASON_CODES,
} from "@omini/shared";

/** Static contract only: never instantiates a driver or executes SQL. */
export async function validateCancellationMigration(
  previous: string,
  current: string,
  oldSql: string,
  sql: string,
) {
  const before = (await getDMMF({ datamodel: previous })).datamodel;
  const after = (await getDMMF({ datamodel: current })).datamodel;
  assert.equal(after.models.length, before.models.length);
  assert.deepEqual(after.indexes, before.indexes);
  for (const model of before.models) {
    const next = after.models.find((m) => m.name === model.name)!;
    assert.deepEqual(
      next.fields.filter((f) =>
        model.fields.some((old) => old.name === f.name),
      ),
      model.fields,
    );
    const added = next.fields.filter(
      (f) => !model.fields.some((old) => old.name === f.name),
    );
    assert.deepEqual(
      added.map((f) => f.name),
      model.name === "ServiceRequestEvent"
        ? ["reasonCode", "executionContext"]
        : [],
    );
    for (const field of added) {
      assert.equal(field.isRequired, false);
      assert.equal(field.hasDefaultValue, false);
      assert.deepEqual(field.nativeType, [
        "NVarChar",
        [field.name === "reasonCode" ? "40" : "32"],
      ]);
    }
  }
  assert.doesNotMatch(
    sql,
    /^\s*(?:DELETE|UPDATE|INSERT|MERGE|TRUNCATE|CREATE TABLE|DROP TABLE|DROP DATABASE|ALTER DATABASE|USE)\b/gim,
  );
  assert.doesNotMatch(sql, /NOCHECK|DROP COLUMN/i);
  assert.match(sql, /SET XACT_ABORT ON/);
  for (const token of [
    "BEGIN TRANSACTION",
    "COMMIT TRANSACTION",
    "ROLLBACK TRANSACTION",
    "BEGIN TRY",
    "BEGIN CATCH",
    "THROW",
  ])
    assert.ok(sql.includes(token));
  assert.match(sql, /IF DB_NAME\(\) <> N'OminiDB' THROW/);
  assert.match(sql, /COL_LENGTH\(N'dbo.ServiceRequestEvent', N'reasonCode'\)/);
  assert.match(
    sql,
    /ADD \[reasonCode\] NVARCHAR\(40\) NULL, \[executionContext\] NVARCHAR\(32\) NULL/,
  );
  const drop =
    "ALTER TABLE [dbo].[ServiceRequestEvent] DROP CONSTRAINT [ServiceRequestEvent_transition_check];";
  assert.ok(sql.includes(drop));
  assert.equal((sql.match(/DROP CONSTRAINT/g) ?? []).length, 1);
  const oldCheck = oldSql.match(
    /ADD CONSTRAINT \[ServiceRequestEvent_transition_check\] CHECK (\([\s\S]*?\n\));/,
  )![1];
  const newCheck = sql.match(
    /WITH CHECK ADD CONSTRAINT \[ServiceRequestEvent_transition_check\] CHECK (\([\s\S]*?\n\));/,
  )![1];
  const broadened = oldCheck.replace(
    "[previousStatus] IN (N'REQUESTED',N'ACCEPTED')",
    "[previousStatus] IN (N'REQUESTED',N'ACCEPTED',N'IN_PROGRESS',N'AWAITING_CONFIRMATION')",
  );
  assert.equal(newCheck.replace(/\s/g, ""), broadened.replace(/\s/g, ""));
  assert.ok(sql.indexOf("BEGIN TRANSACTION") < sql.indexOf(drop));
  assert.ok(sql.indexOf(drop) < sql.indexOf("WITH CHECK ADD CONSTRAINT"));
  assert.ok(
    sql.indexOf("WITH CHECK ADD CONSTRAINT") <
      sql.indexOf("COMMIT TRANSACTION"),
  );
  assert.match(
    sql,
    /CHECK CONSTRAINT \[ServiceRequestEvent_transition_check\]/,
  );
  assert.match(
    sql,
    /WITH CHECK ADD CONSTRAINT \[ServiceRequestEvent_cancellation_metadata_check\]/,
  );
  assert.match(
    sql,
    /\[reasonCode\] IS NULL AND \[executionContext\] IS NULL AND NOT/,
  );
  assert.match(sql, /\[reason\] IS NOT NULL/);
  assert.match(sql, /BETWEEN 10 AND 500/);
  assert.match(
    sql,
    /\[executionContext\] IS NULL AND \[previousStatus\] NOT IN/,
  );
  for (const code of [
    ...CANCELLATION_REASON_CODES,
    ...CANCELLATION_EXECUTION_CONTEXTS,
  ])
    assert.ok(sql.includes(`N'${code}'`));
}
