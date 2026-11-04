import { spawnSync } from "node:child_process";
// Prisma loads apps/api/.env. SELECT 1 is read-only and creates no tables.
const result = spawnSync(
  process.execPath,
  [
    require.resolve("prisma/build/index.js"),
    "db",
    "execute",
    "--schema",
    "prisma/schema.prisma",
    "--stdin",
  ],
  { input: "SELECT 1 AS connected;", encoding: "utf8" },
);
if (result.error || result.status !== 0) {
  console.error(
    "SQL Server check failed. Verify DATABASE_URL, Prisma engine access, TCP port, login and certificate settings. Credentials and raw driver errors are not logged.",
  );
  process.exitCode = 1;
} else
  console.log(
    "SQL Server SELECT 1 completed successfully. No tables or migrations were created.",
  );
