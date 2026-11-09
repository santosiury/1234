import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { migrationEnvironment } from "./migration-env";
// Separate ignored file; never falls back to the runtime identity.
config({ path: ".env.migrations", quiet: true });
try {
  const action = process.argv[2];
  if (action !== "status" && action !== "deploy")
    throw new Error("Unsupported migration action");
  const env = migrationEnvironment(process.env);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      action,
      "--schema",
      "prisma/schema.prisma",
    ],
    { env, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    console.error(
      "Migration command did not complete. Status may indicate pending migrations. Review the local runbook, identity, inventory/history, engine access and permissions. Raw driver output is suppressed.",
    );
    process.exitCode = result.status ?? 1;
  } else console.log(`Migration ${action} completed successfully.`);
} catch {
  console.error(
    "Separate MIGRATION_DATABASE_URL for OminiDB is required; runtime identity and unsupported commands are rejected. No connection or credentials were logged.",
  );
  process.exitCode = 1;
}
