import { readFile } from "node:fs/promises";
import { validateInitialMigration } from "./migration-validation";
async function main() {
  const schema = await readFile(
    "prisma/history/phase21.prisma.snapshot",
    "utf8",
  );
  const sql = await readFile(
    "prisma/migrations/20261109000000_persistence_foundation/migration.sql",
    "utf8",
  );
  await validateInitialMigration(schema, sql);
  const current = await readFile("prisma/schema.prisma", "utf8");
  const authSql = await readFile(
    "prisma/migrations/20261110000000_authentication/migration.sql",
    "utf8",
  );
  await validateInitialMigration(current, authSql, [
    "AuthCredential",
    "AuthSession",
    "RefreshToken",
  ]);
  await validateInitialMigration(
    current,
    await readFile(
      "prisma/migrations/20261112000000_service_requests/migration.sql",
      "utf8",
    ),
    ["ServiceRequest", "ServiceRequestEvent"],
  );
  console.log("Incremental requests SQL contract passed; no SQL was executed.");
  console.log(
    "Incremental authentication SQL contract passed; no SQL was executed.",
  );
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
