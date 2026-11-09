import { readFile } from "node:fs/promises";
import { validateInitialMigration } from "./migration-validation";
async function main() {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const sql = await readFile(
    "prisma/migrations/20261109000000_persistence_foundation/migration.sql",
    "utf8",
  );
  await validateInitialMigration(schema, sql);
  console.log(
    "Static migration checks passed: columns, types, defaults, uniqueness, indexes, FK actions and additive guards. SQL was NOT executed.",
  );
}
main().catch(() => {
  console.error(
    "Static migration contract check failed. Review schema and SQL together.",
  );
  process.exitCode = 1;
});
