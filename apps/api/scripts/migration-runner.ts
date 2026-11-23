import {
  migrationEnvironment,
  MigrationEnvironmentError,
} from "./migration-env";
import {
  classifyMigrationFailure,
  migrationDiagnosticMessage,
  MigrationProcessResult,
} from "./migration-diagnostics";

export interface MigrationRunnerDependencies {
  executable: string;
  resolveCli: () => string;
  spawn: (
    executable: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; encoding: "utf8" },
  ) => MigrationProcessResult;
  log: (message: string) => void;
  error: (message: string) => void;
}

export function runMigration(
  action: string | undefined,
  sourceEnv: NodeJS.ProcessEnv,
  dependencies: MigrationRunnerDependencies,
): number {
  if (action !== "status" && action !== "deploy") {
    dependencies.error(
      "[migration:action] Only status and deploy are supported.",
    );
    return 1;
  }
  let env: NodeJS.ProcessEnv;
  try {
    // Validate before resolving/loading Prisma, for both supported actions.
    env = migrationEnvironment(sourceEnv);
  } catch (error) {
    dependencies.error(
      error instanceof MigrationEnvironmentError
        ? `[migration:configuration:${error.code}] ${error.message}`
        : "[migration:configuration] Migration configuration was rejected; details are suppressed.",
    );
    return 1;
  }
  let cli: string;
  try {
    cli = dependencies.resolveCli();
  } catch {
    dependencies.error(migrationDiagnosticMessage("engine"));
    return 1;
  }
  let result: MigrationProcessResult;
  try {
    result = dependencies.spawn(
      dependencies.executable,
      [cli, "migrate", action, "--schema", "prisma/schema.prisma"],
      { env, encoding: "utf8" },
    );
  } catch {
    dependencies.error(migrationDiagnosticMessage("process"));
    return 1;
  }
  if (result.status === 0 && !result.error && !result.signal) {
    dependencies.log(`Migration ${action} completed successfully.`);
    return 0;
  }
  dependencies.error(
    migrationDiagnosticMessage(classifyMigrationFailure(action, result)),
  );
  // Never return success for a launch error, signal or an invalid/null status.
  return typeof result.status === "number" &&
    Number.isInteger(result.status) &&
    result.status > 0 &&
    result.status <= 255
    ? result.status
    : 1;
}
