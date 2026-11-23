export type MigrationAction = "status" | "deploy";

export interface MigrationProcessResult {
  status: number | null;
  signal?: string | null;
  error?: Error;
  stdout?: string | null;
  stderr?: string | null;
}

// Only these fixed messages reach the console. Never redact and reprint raw
// Prisma/driver output: it can contain credentials, SQL, URLs or environment data.
const diagnostics = {
  pending:
    "Pending migrations detected by status. Nothing was applied; review the SQL and obtain authorization before deploy.",
  connection:
    "Cannot reach the authorized test database or the connection timed out. Check the test instance, TCP port and firewall locally.",
  credentials:
    "SQL Server rejected authentication. Check the migration login and its local secret; do not share credentials or raw logs.",
  permissions:
    "The migration identity lacks required database permissions. Review the scoped migration grants; do not grant administrative roles.",
  tls: "The encrypted SQL Server connection failed certificate/TLS validation. Review the test certificate configuration; keep encryption enabled.",
  database:
    "The configured test database is unavailable or Prisma reported a database creation failure. Verify the existing test database; no fallback or automatic repair was attempted.",
  history:
    "Migration history is inconsistent or a migration failed. Stop and review local history and SQL; no automatic repair or reset was attempted.",
  schema:
    "Prisma rejected the schema or connection configuration. Review the local configuration without sharing its values.",
  engine:
    "Prisma CLI/schema engine could not be loaded, downloaded or executed. Check the installed Prisma version, engine files, network access and OS permissions.",
  process:
    "The Prisma process was interrupted or could not complete. Its output is suppressed; no automatic retry was attempted.",
  unknown:
    "Prisma failed without a recognized safe diagnostic. Exit status alone does not prove pending migrations. Raw output is suppressed; review locally without sharing secrets.",
} as const;

export type MigrationDiagnostic = keyof typeof diagnostics;

export function migrationDiagnosticMessage(kind: MigrationDiagnostic): string {
  return `[migration:${kind}] ${diagnostics[kind]}`;
}

export function classifyMigrationFailure(
  action: MigrationAction,
  result: MigrationProcessResult,
): MigrationDiagnostic {
  if (result.error || result.signal) {
    const code =
      result.error && "code" in result.error ? result.error.code : undefined;
    return [
      "ENOENT",
      "EACCES",
      "EPERM",
      "ENOEXEC",
      "ERR_DLOPEN_FAILED",
    ].includes(String(code))
      ? "engine"
      : "process";
  }
  // ANSI escapes are removed only for matching, never for console output.
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.replace(
    /\x1b\[[0-9;]*m/g,
    "",
  );
  const codes = new Set(output.match(/\bP\d{4}\b/g) ?? []);
  const hasCode = (...values: string[]) =>
    values.some((code) => codes.has(code));
  if (
    hasCode("P1000") ||
    /\bELOGIN\b|Login failed for user|Database error code:\s*(18456|18452)\b/i.test(
      output,
    )
  )
    return "credentials";
  if (
    hasCode("P1010") ||
    /Database error code:\s*(229|230|262|15151|15247)\b|permission (?:was )?denied (?:on|in|for)|(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE TABLE|VIEW DEFINITION) permission was denied/i.test(
      output,
    )
  )
    return "permissions";
  // A download DNS/certificate error concerns the engine distribution, not the
  // SQL Server connection. Match this before generic driver network/TLS text.
  if (
    /(?:failed to fetch|failed to download|error fetching).*?(?:binaries\.prisma\.sh|schema[- ]engine|migration[- ]engine)/i.test(
      output,
    ) ||
    /request to https?:\/\/binaries\.prisma\.sh\/\S* failed/i.test(output)
  )
    return "engine";
  if (
    hasCode("P1011") ||
    /certificate verify failed|self[- ]signed certificate|unable to verify the first certificate/i.test(
      output,
    )
  )
    return "tls";
  if (
    hasCode("P1001", "P1002", "P1008", "P1017") ||
    /\b(?:ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEOUT)\b|can't reach database server/i.test(
      output,
    )
  )
    return "connection";
  if (hasCode("P1003", "P3000")) return "database";
  if (
    hasCode("P3005", "P3008", "P3009", "P3015", "P3018", "P3019") ||
    /migration histor(?:y|ies).*diverg|failed migrations? in the target database|migrations? from the database are not found locally|migration history and the migrations table from your database are different|^Following migrations? have failed:|not (?:yet )?managed by Prisma Migrate/im.test(
      output,
    )
  )
    return "history";
  if (hasCode("P1012", "P1013")) return "schema";
  if (
    /(?:could not|cannot|unable to) (?:find|load|download|start|execute).*?(?:schema[- ]engine|migration[- ]engine|prisma)/i.test(
      output,
    ) ||
    /(?:schema[- ]engine|migration[- ]engine).*?(?:ENOENT|EACCES|EPERM|not found|does not exist|failed to start)/i.test(
      output,
    )
  )
    return "engine";
  // Known CLI output from Prisma 6.19.3. Do not interpret every nonzero status as
  // pending, or let a pending list hide another Prisma error in the same output.
  if (
    action === "status" &&
    result.status === 1 &&
    codes.size === 0 &&
    !/^\s*(?:error|fatal|panic)\b/im.test(output) &&
    /^Following migrations? have not yet been applied:\s*$/m.test(output)
  )
    return "pending";
  return "unknown";
}
