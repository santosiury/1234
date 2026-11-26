import assert from "node:assert/strict";
import { getDMMF } from "@prisma/internals";
import { validateInitialMigration } from "./migration-validation";
export async function validateProtectedReviewsMigration(
  previous: string,
  current: string,
  sql: string,
) {
  await validateInitialMigration(current, sql, [
    "ReviewWindow",
    "ParticipantReview",
    "ReputationBatch",
  ]);
  const [before, after] = await Promise.all([
    getDMMF({ datamodel: previous }),
    getDMMF({ datamodel: current }),
  ]);
  assert.equal(
    after.datamodel.models.length,
    before.datamodel.models.length + 3,
  );
  for (const old of before.datamodel.models) {
    const next = after.datamodel.models.find((m) => m.name === old.name)!;
    for (const field of old.fields) {
      assert.deepEqual(
        next.fields.find((f) => f.name === field.name),
        field,
        `Historical field/relation changed: ${old.name}.${field.name}`,
      );
    }
    assert.deepEqual(
      after.datamodel.indexes.filter((i) => i.model === old.name),
      before.datamodel.indexes.filter((i) => i.model === old.name),
    );
  }
  assert.doesNotMatch(sql, /^\s*GO\s*$/im);
  assert.match(sql, /CONNECTIONPROPERTY\('local_tcp_port'\)/);
  assert.match(sql, /<> 15433 THROW/);
  assert.match(sql, /DATEADD\(DAY,14,\[completedAt\]\)/);
  assert.match(sql, /\[authorUserId\]<>\[subjectUserId\]/);
  assert.match(sql, /\[rating\] BETWEEN 1 AND 5/);
  assert.match(sql, /\[distinctAuthorCount\]>=5/);
  assert.doesNotMatch(sql, /INSERT (?:INTO )?\[dbo\]\.\[ReviewWindow\]/i);
  assert.doesNotMatch(
    sql,
    /(?:UPDATE|DELETE FROM|TRUNCATE TABLE|DROP TABLE|ALTER TABLE) \[dbo\]\.\[(?:ServiceReview|ServiceRequest|User|ServiceRequestEvent)\]/i,
  );
  const batches = [
    ...sql.matchAll(/EXEC sys\.sp_executesql N'((?:''|[^'])*)';/g),
  ].map((m) => m[1].replaceAll("''", "'"));
  assert.equal(batches.length, 2);
  assert.match(batches[0], /INSERT INTO \[dbo\]\.\[ParticipantReview\]/);
  assert.match(
    batches[0],
    /SELECT \[id\], \[requestId\], N'CLIENT_TO_PROVIDER', \[clientUserId\], \[providerUserId\], \[rating\], \[comment\], \[createdAt\], \[createdAt\], 1, NULL FROM \[dbo\]\.\[ServiceReview\]/,
  );
  assert.match(
    batches[0],
    /FROM \[dbo\]\.\[ServiceReview\] WITH \(TABLOCKX,HOLDLOCK\)/,
  );
  assert.match(batches[0], /COUNT_BIG/);
  assert.match(
    batches[1],
    /^CREATE TRIGGER .* INSTEAD OF INSERT .* THROW 50004/,
  );
  assert.ok(
    sql.indexOf("CREATE TABLE [dbo].[ParticipantReview]") <
      sql.indexOf("EXEC sys.sp_executesql"),
  );
  assert.ok(
    sql.lastIndexOf("EXEC sys.sp_executesql") <
      sql.indexOf("COMMIT TRANSACTION"),
  );
}
