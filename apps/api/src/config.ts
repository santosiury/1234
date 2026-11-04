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
  return { ...env, PORT: port, CORS_ORIGINS: origins };
}
