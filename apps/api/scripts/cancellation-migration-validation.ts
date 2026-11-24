import assert from "node:assert/strict";
import { getDMMF } from "@prisma/internals";
import {
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLATION_REASON_CODES,
} from "@omini/shared";

const addMetadataColumns =
  "ALTER TABLE [dbo].[ServiceRequestEvent] ADD [reasonCode] NVARCHAR(40) NULL, [executionContext] NVARCHAR(32) NULL;";

/** Decode the one fixed DDL literal; this does not evaluate or execute T-SQL. */
export function cancellationMetadataBatch(source: string) {
  assert.doesNotMatch(
    source,
    /^\s*GO\b/gim,
    "Prisma migration must remain one outer batch",
  );
  const calls = [
    ...source.matchAll(/EXEC sys\.sp_executesql N'((?:''|[^'])*)';/g),
  ];
  assert.equal(
    calls.length,
    1,
    "Metadata CHECK needs one separate compilation batch",
  );
  const call = calls[0];
  const metadataSql = call[1].replace(/''/g, "'").trim();
  const outerSql =
    source.slice(0, call.index) + source.slice(call.index + call[0].length);
  // Ignore quoted messages and line comments, e.g. "Do not execute", when
  // looking for additional executable statements in this fixed SQL contract.
  const outerCode = outerSql.replace(/N?'(?:''|[^'])*'|--[^\r\n]*/g, "");
  assert.doesNotMatch(
    outerCode,
    /\bEXEC(?:UTE)?\b|\bsp_executesql\b/i,
    "Only the fixed metadata DDL may be dynamic",
  );
  assert.match(
    metadataSql,
    /^ALTER TABLE \[dbo\]\.\[ServiceRequestEvent\] WITH CHECK ADD CONSTRAINT \[ServiceRequestEvent_cancellation_metadata_check\] CHECK \([\s\S]*\);$/,
  );
  assert.equal(
    (metadataSql.match(/;/g) ?? []).length,
    1,
    "Dynamic batch must contain only the metadata CHECK",
  );
  assert.doesNotMatch(metadataSql, /\bEXEC(?:UTE)?\b|^\s*GO\b/gim);
  assert.ok(outerSql.includes(addMetadataColumns));
  assert.doesNotMatch(
    outerSql.replace(addMetadataColumns, ""),
    /\[(?:reasonCode|executionContext)\]/,
    "New column references must not be compiled in the outer batch",
  );
  return {
    metadataSql,
    outerSql,
    index: call.index,
    logicalSql:
      source.slice(0, call.index) +
      metadataSql +
      source.slice(call.index + call[0].length),
  };
}

/** Static contract only: never instantiates a driver or executes SQL. */
export async function validateCancellationMigration(
  previous: string,
  current: string,
  oldSql: string,
  sourceSql: string,
) {
  const batch = cancellationMetadataBatch(sourceSql);
  const begin = sourceSql.indexOf("BEGIN TRANSACTION");
  const add = sourceSql.indexOf(addMetadataColumns);
  const commit = sourceSql.indexOf("COMMIT TRANSACTION");
  assert.ok(sourceSql.indexOf("BEGIN TRY") < begin);
  assert.ok(
    begin >= 0 && begin < add && add < batch.index && batch.index < commit,
  );
  assert.ok(commit < sourceSql.indexOf("END TRY"));
  assert.match(
    batch.outerSql,
    /BEGIN CATCH\s+IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\s+THROW;\s+END CATCH;/,
  );
  // Inspect decoded SQL too: escaping a literal must not hide weakening or writes
  // from the existing static checks. This is not a SQL Server compilation test.
  const sql = batch.logicalSql;
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
