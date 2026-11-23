import { parseSqlServerUrl } from "../src/persistence/sqlserver-url";

const messages = {
  missing:
    "A separate MIGRATION_DATABASE_URL is required; runtime fallback is disabled.",
  invalid:
    "Invalid migration connection configuration; connection details are suppressed.",
  target:
    "Phase 2.6 migrations require 127.0.0.1:15433, OminiDB and omini_migrator. All other targets are blocked.",
  shared: "Migration and runtime connections must be separate.",
} as const;

export class MigrationEnvironmentError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "MigrationEnvironmentError";
  }
}

export function migrationEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const url = env.MIGRATION_DATABASE_URL;
  if (!url) throw new MigrationEnvironmentError("missing");
  let config: ReturnType<typeof parseSqlServerUrl>;
  try {
    config = parseSqlServerUrl(url);
  } catch {
    throw new MigrationEnvironmentError("invalid");
  }
  // This is deliberately not configurable through an environment flag. Production
  // needs a separately reviewed configuration and explicit authorization.
  if (
    config.server !== "127.0.0.1" ||
    config.port !== 15433 ||
    config.database !== "OminiDB" ||
    config.user !== "omini_migrator"
  )
    throw new MigrationEnvironmentError("target");
  if (url === env.DATABASE_URL) throw new MigrationEnvironmentError("shared");
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: url };
  delete childEnv.MIGRATION_DATABASE_URL;
  return childEnv;
}
