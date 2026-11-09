import assert from "node:assert/strict";
import { getDMMF } from "@prisma/internals";
// Static contract check for the initial additive migration, NOT a SQL execution test.
export async function validateInitialMigration(schema: string, sql: string) {
  const { datamodel } = await getDMMF({ datamodel: schema });
  assert.doesNotMatch(
    sql,
    /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|MERGE|USE|CREATE DATABASE|ALTER DATABASE)\b/gim,
  );
  assert.match(sql, /IF DB_NAME\(\) <> N'OminiDB' THROW/);
  assert.match(sql, /SET XACT_ABORT ON/);
  assert.match(sql, /BEGIN TRANSACTION/);
  assert.match(sql, /COMMIT TRANSACTION/);
  assert.match(sql, /ROLLBACK TRANSACTION/);
  const tables = [
    ...sql.matchAll(/CREATE TABLE \[dbo\]\.\[(\w+)\] \(([\s\S]*?)\n\);/g),
  ];
  assert.equal(
    tables.length,
    datamodel.models.length,
    "Unexpected table count",
  );
  const flat = sql.replace(/\s+/g, " ");
  const quoted = (names: readonly string[]) =>
    names.map((name) => `[${name}]`).join(", ");
  let relationCount = 0;
  for (const model of datamodel.models) {
    const body = tables.find((table) => table[1] === model.name)?.[2];
    assert.ok(body, `Missing table ${model.name}`);
    assert.ok(
      sql.includes(`OBJECT_ID(N'[dbo].[${model.name}]'`),
      "Existing-table collision guard missing",
    );
    const scalars = model.fields.filter((field) => field.kind === "scalar");
    assert.equal(
      [
        ...body.matchAll(
          /^\s*\[\w+\] (?:NVARCHAR|CHAR|UNIQUEIDENTIFIER|DATETIME2|BIT|INT)\b/gm,
        ),
      ].length,
      scalars.length,
    );
    for (const field of scalars) {
      const type = field.nativeType
        ? field.nativeType[0].toUpperCase() +
          (field.nativeType[1].length
            ? `(${field.nativeType[1].join(",")})`
            : "")
        : field.type === "Boolean"
          ? "BIT"
          : "INT";
      assert.ok(
        body.includes(
          `[${field.name}] ${type} ${field.isRequired ? "NOT NULL" : "NULL"}`,
        ),
        `Column type/nullability mismatch ${model.name}.${field.name}`,
      );
      const line = body
        .split("\n")
        .find((line) => line.trimStart().startsWith(`[${field.name}] `))!;
      if (field.hasDefaultValue) {
        const value = field.default;
        const expression =
          typeof value === "object" && value !== null && "args" in value
            ? String(value.args[0])
            : typeof value === "boolean"
              ? value
                ? "1"
                : "0"
              : typeof value === "number"
                ? String(value)
                : `N'${String(value).replaceAll("'", "''")}'`;
        assert.ok(
          line.includes(
            `CONSTRAINT [${model.name}_${field.name}_df] DEFAULT (${expression})`,
          ),
          `Default mismatch ${model.name}.${field.name}`,
        );
      } else assert.ok(!line.includes("DEFAULT"), "Unexpected default");
    }
    for (const field of model.fields.filter(
      (field) => field.kind === "object" && field.relationFromFields?.length,
    )) {
      relationCount++;
      assert.equal(field.relationOnDelete, "NoAction");
      assert.equal(field.relationOnUpdate, "NoAction");
      const expected = `ALTER TABLE [dbo].[${model.name}] ADD CONSTRAINT [${model.name}_${field.relationFromFields!.join("_")}_fkey] FOREIGN KEY (${quoted(field.relationFromFields!)}) REFERENCES [dbo].[${field.type}] (${quoted(field.relationToFields!)}) ON DELETE NO ACTION ON UPDATE NO ACTION;`;
      assert.ok(
        flat.includes(expected),
        `FK mismatch ${model.name}.${field.name}`,
      );
    }
    for (const index of datamodel.indexes.filter(
      (index) => index.model === model.name,
    )) {
      const names = index.fields.map((field) => field.name);
      let width = 0;
      for (const name of names) {
        const field = model.fields.find((field) => field.name === name)!;
        const native = field.nativeType;
        width +=
          native?.[0] === "NVarChar"
            ? Number(native[1][0]) * 2
            : native?.[0] === "Char"
              ? Number(native[1][0])
              : native?.[0] === "UniqueIdentifier"
                ? 16
                : 8;
      }
      assert.ok(
        width <= 900,
        "Index key exceeds conservative SQL Server 900-byte bound",
      );
      const columns = quoted(names);
      const name =
        model.name +
        "_" +
        (index.type === "id"
          ? "pkey"
          : names.join("_") + (index.type === "unique" ? "_key" : "_idx"));
      const expected =
        index.type === "normal"
          ? `CREATE NONCLUSTERED INDEX [${name}] ON [dbo].[${model.name}] (${columns});`
          : `CONSTRAINT [${name}] ${index.type === "id" ? "PRIMARY KEY CLUSTERED" : "UNIQUE NONCLUSTERED"} (${columns})`;
      assert.ok(flat.includes(expected), `Index mismatch ${name}`);
    }
  }
  assert.equal((sql.match(/FOREIGN KEY/g) ?? []).length, relationCount);
  assert.equal(
    (sql.match(/CREATE NONCLUSTERED INDEX/g) ?? []).length,
    datamodel.indexes.filter((index) => index.type === "normal").length,
  );
}
