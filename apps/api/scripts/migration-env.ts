import { parseSqlServerUrl } from "../src/persistence/sqlserver-url";
export function migrationEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const url = env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Separate migration identity required");
  const config = parseSqlServerUrl(url);
  if (
    config.database !== "OminiDB" ||
    config.user.toLowerCase() === "omini_app" ||
    url === env.DATABASE_URL
  )
    throw new Error("Migration identity or database is not permitted");
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: url };
  delete childEnv.MIGRATION_DATABASE_URL;
  return childEnv;
}
