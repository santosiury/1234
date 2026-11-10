export function validateEnvironment(env: Record<string, unknown>) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535");
  const origins = String(env.CORS_ORIGINS ?? "http://localhost:8081")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      throw new Error("CORS_ORIGINS must contain comma-separated HTTP origins");
  }
  const flag = (name: string) => {
    const value = env[name] ?? "false";
    if (value !== "true" && value !== "false")
      throw new Error(`${name} must be true or false`);
    return value === "true";
  };
  const persistence = flag("PERSISTENCE_ENABLED");
  if (
    persistence &&
    (typeof env.DATABASE_URL !== "string" ||
      !env.DATABASE_URL.startsWith("sqlserver://"))
  )
    throw new Error(
      "DATABASE_URL must be configured for SQL Server when persistence is enabled",
    );
  const nodeEnv = String(env.NODE_ENV ?? "development");
  if (!["development", "test", "production"].includes(nodeEnv))
    throw new Error("Invalid NODE_ENV");
  const auth = flag("AUTH_ENABLED");
  if (
    auth &&
    (!persistence ||
      typeof env.JWT_ACCESS_SECRET !== "string" ||
      Buffer.byteLength(env.JWT_ACCESS_SECRET.trim()) < 48)
  )
    throw new Error(
      "AUTH_ENABLED requires persistence and JWT_ACCESS_SECRET with at least 48 bytes",
    );
  return {
    ...env,
    AUTH_ENABLED: auth,
    PORT: port,
    CORS_ORIGINS: origins,
    NODE_ENV: nodeEnv,
    PERSISTENCE_ENABLED: persistence,
    DB_DIAGNOSTICS_ENABLED: flag("DB_DIAGNOSTICS_ENABLED"),
  };
}
