import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { runMigration } from "./migration-runner";

// Importing the entrypoint in tests must not load secrets or start Prisma.
if (require.main === module) {
  try {
    // Separate ignored file; never falls back to the runtime identity.
    config({ path: ".env.migrations", quiet: true });
    process.exitCode = runMigration(process.argv[2], process.env, {
      executable: process.execPath,
      resolveCli: () => require.resolve("prisma/build/index.js"),
      spawn: (executable, args, options) =>
        spawnSync(executable, args, options),
      log: (message) => console.log(message),
      error: (message) => console.error(message),
    });
  } catch {
    console.error(
      "[migration:configuration] Migration runner could not initialize; details are suppressed.",
    );
    process.exitCode = 1;
  }
}
