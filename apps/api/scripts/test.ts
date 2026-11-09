import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Isolate the suite from developers' .env files and injected database credentials.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  PERSISTENCE_ENABLED: "false",
  DB_DIAGNOSTICS_ENABLED: "false",
};
delete env.DATABASE_URL;
delete env.MIGRATION_DATABASE_URL;
const tests = readdirSync("test")
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => `test/${name}`);
if (!tests.length) throw new Error("No API tests found");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...tests],
  { env, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
