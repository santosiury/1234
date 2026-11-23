import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  migrationEnvironment,
  MigrationEnvironmentError,
} from "../scripts/migration-env";
import {
  runMigration,
  MigrationRunnerDependencies,
} from "../scripts/migration-runner";
import {
  MigrationDiagnostic,
  MigrationProcessResult,
} from "../scripts/migration-diagnostics";

// Synthetic credentials only. All process launches and Prisma resolution are
// injected doubles; this suite never invokes the CLI or opens a SQL connection.
const migrationUrl =
  "sqlserver://127.0.0.1:15433;database=OminiDB;user=omini_migrator;password={fixture;with}}delimiter};encrypt=true;trustServerCertificate=true";
const runtimeUrl =
  "sqlserver://127.0.0.1:1433;database=OminiDB;user=omini_app;password={runtime-fixture};encrypt=true";
const env = { MIGRATION_DATABASE_URL: migrationUrl, DATABASE_URL: runtimeUrl };

function harness(result: MigrationProcessResult = { status: 0 }) {
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: Parameters<MigrationRunnerDependencies["spawn"]>[] = [];
  let resolutions = 0;
  const dependencies: MigrationRunnerDependencies = {
    executable: "/mock/node",
    resolveCli: () => {
      resolutions++;
      return "/mock/prisma-cli.js";
    },
    spawn: (...args) => {
      calls.push(args);
      return result;
    },
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
  };
  return {
    dependencies,
    logs,
    errors,
    calls,
    get resolutions() {
      return resolutions;
    },
  };
}

test("migration environment allows only the test tuple and preserves the source environment", () => {
  const source = Object.freeze({ ...env, PATH: "/mock/path" });
  const child = migrationEnvironment(source);
  assert.equal(child.DATABASE_URL, migrationUrl);
  assert.equal(child.MIGRATION_DATABASE_URL, undefined);
  assert.equal(child.PATH, source.PATH);
  assert.deepEqual(source, { ...env, PATH: "/mock/path" });
  assert.notEqual(child, source);
  assert.equal(
    migrationEnvironment({ MIGRATION_DATABASE_URL: migrationUrl }).DATABASE_URL,
    migrationUrl,
  );
});

const forbidden: [string, NodeJS.ProcessEnv][] = [
  [
    "primary port",
    { MIGRATION_DATABASE_URL: migrationUrl.replace(":15433", ":1433") },
  ],
  [
    "other port",
    { MIGRATION_DATABASE_URL: migrationUrl.replace(":15433", ":15434") },
  ],
  [
    "localhost alias",
    { MIGRATION_DATABASE_URL: migrationUrl.replace("127.0.0.1", "localhost") },
  ],
  [
    "remote host",
    { MIGRATION_DATABASE_URL: migrationUrl.replace("127.0.0.1", "192.0.2.10") },
  ],
  [
    "named instance",
    {
      MIGRATION_DATABASE_URL: migrationUrl.replace(
        "127.0.0.1",
        "localhost\\OMINI_TEST",
      ),
    },
  ],
  [
    "other database",
    { MIGRATION_DATABASE_URL: migrationUrl.replace("OminiDB", "OtherDB") },
  ],
  [
    "database suffix",
    { MIGRATION_DATABASE_URL: migrationUrl.replace("OminiDB", "OminiDB_copy") },
  ],
  [
    "runtime identity",
    {
      MIGRATION_DATABASE_URL: migrationUrl.replace(
        "omini_migrator",
        "omini_app",
      ),
    },
  ],
  [
    "admin identity",
    { MIGRATION_DATABASE_URL: migrationUrl.replace("omini_migrator", "sa") },
  ],
  [
    "other migrator",
    {
      MIGRATION_DATABASE_URL: migrationUrl.replace(
        "omini_migrator",
        "other_migrator",
      ),
    },
  ],
  [
    "case variant identity",
    {
      MIGRATION_DATABASE_URL: migrationUrl.replace(
        "omini_migrator",
        "OMINI_MIGRATOR",
      ),
    },
  ],
  ["primary connection fallback", { DATABASE_URL: runtimeUrl }],
  ["allowed connection fallback", { DATABASE_URL: migrationUrl }],
  [
    "empty migration connection",
    { DATABASE_URL: runtimeUrl, MIGRATION_DATABASE_URL: "" },
  ],
  [
    "shared identity",
    { DATABASE_URL: migrationUrl, MIGRATION_DATABASE_URL: migrationUrl },
  ],
  [
    "encryption disabled",
    {
      MIGRATION_DATABASE_URL: migrationUrl.replace(
        "encrypt=true",
        "encrypt=false",
      ),
    },
  ],
  [
    "duplicate database",
    { MIGRATION_DATABASE_URL: `${migrationUrl};database=OtherDB` },
  ],
  [
    "redirect parameter",
    { MIGRATION_DATABASE_URL: `${migrationUrl};server=other.invalid` },
  ],
  [
    "missing password",
    {
      MIGRATION_DATABASE_URL:
        "sqlserver://127.0.0.1:15433;database=OminiDB;user=omini_migrator",
    },
  ],
  [
    "malformed URL",
    { MIGRATION_DATABASE_URL: "not-a-connection\nprivate-fixture" },
  ],
];

for (const [name, forbiddenEnv] of forbidden) {
  for (const action of ["status", "deploy"] as const) {
    test(`${action} blocks ${name} before resolving or starting Prisma`, () => {
      const mock = harness();
      assert.equal(runMigration(action, forbiddenEnv, mock.dependencies), 1);
      assert.equal(mock.resolutions, 0);
      assert.equal(mock.calls.length, 0);
      assert.equal(mock.logs.length, 0);
      assert.equal(mock.errors.length, 1);
      assert.match(mock.errors[0], /^\[migration:configuration:/);
      assert.doesNotMatch(
        mock.errors[0],
        /sqlserver:\/\/|fixture|password=|192\.0\.2\.10|OtherDB|other_migrator/,
      );
      assert.throws(
        () => migrationEnvironment(forbiddenEnv),
        MigrationEnvironmentError,
      );
    });
  }
}

for (const action of ["status", "deploy"] as const) {
  test(`${action} uses the validated connection and captures all child output`, () => {
    const mock = harness({
      status: 0,
      stdout: migrationUrl,
      stderr: runtimeUrl,
    });
    assert.equal(runMigration(action, env, mock.dependencies), 0);
    assert.equal(mock.resolutions, 1);
    assert.equal(mock.calls.length, 1);
    const [executable, args, options] = mock.calls[0];
    assert.equal(executable, "/mock/node");
    assert.deepEqual(args, [
      "/mock/prisma-cli.js",
      "migrate",
      action,
      "--schema",
      "prisma/schema.prisma",
    ]);
    assert.equal(options.encoding, "utf8");
    assert.equal(options.env.DATABASE_URL, migrationUrl);
    assert.equal(options.env.MIGRATION_DATABASE_URL, undefined);
    assert.equal(JSON.stringify(args).includes(migrationUrl), false);
    assert.deepEqual(mock.logs, [
      `Migration ${action} completed successfully.`,
    ]);
    assert.deepEqual(mock.errors, []);
  });
}

test("unsupported actions and missing actions cannot start Prisma", () => {
  for (const action of [undefined, "reset", "dev", "STATUS", migrationUrl]) {
    const mock = harness();
    assert.equal(runMigration(action, env, mock.dependencies), 1);
    assert.equal(mock.resolutions, 0);
    assert.equal(mock.calls.length, 0);
    assert.deepEqual(mock.errors, [
      "[migration:action] Only status and deploy are supported.",
    ]);
  }
});

const pending =
  "Following migrations have not yet been applied:\nprivate-migration-name\n";
const diagnostics: [string, MigrationProcessResult, MigrationDiagnostic][] = [
  [
    "engine download DNS failure",
    {
      status: 1,
      stderr:
        "request to https://binaries.prisma.sh/private-path failed, reason: getaddrinfo ENOTFOUND",
    },
    "engine",
  ],
  [
    "engine download certificate failure",
    {
      status: 1,
      stderr:
        "request to https://binaries.prisma.sh/private-path failed, reason: self-signed certificate",
    },
    "engine",
  ],
  [
    "missing migration history",
    { status: 1, stderr: "The database is not yet managed by Prisma Migrate." },
    "history",
  ],
  ["pending", { status: 1, stdout: pending }, "pending"],
  [
    "singular pending with ANSI",
    {
      status: 1,
      stdout:
        "\u001b[1mFollowing migration have not yet been applied:\u001b[0m\nprivate-name",
    },
    "pending",
  ],
  [
    "connection",
    { status: 1, stderr: "Error: P1001: Can't reach database server" },
    "connection",
  ],
  ["timeout", { status: 1, stderr: "Error: P1002" }, "connection"],
  ["driver connection", { status: 1, stderr: "ECONNREFUSED" }, "connection"],
  ["credentials", { status: 1, stderr: "Error: P1000" }, "credentials"],
  [
    "SQL login",
    { status: 1, stderr: "Login failed for user 'private-name'" },
    "credentials",
  ],
  [
    "nested SQL login",
    { status: 1, stderr: "P3018\nDatabase error code: 18456" },
    "credentials",
  ],
  ["permission", { status: 1, stderr: "Error: P1010" }, "permissions"],
  [
    "nested SQL permission",
    { status: 1, stderr: "P3018\nDatabase error code: 229" },
    "permissions",
  ],
  [
    "DDL permission",
    {
      status: 1,
      stderr: "CREATE TABLE permission denied in database 'private-name'",
    },
    "permissions",
  ],
  ["TLS", { status: 1, stderr: "Error: P1011" }, "tls"],
  ["certificate", { status: 1, stderr: "self-signed certificate" }, "tls"],
  ["database", { status: 1, stderr: "Error: P1003" }, "database"],
  ["schema", { status: 1, stderr: "Error: P1012" }, "schema"],
  ["failed migration", { status: 1, stderr: "Error: P3009" }, "history"],
  [
    "unclassified SQL failure",
    { status: 1, stderr: "Error: P3018\nDatabase error code: 12345" },
    "history",
  ],
  [
    "status failed migration",
    { status: 1, stderr: "Following migration have failed:\nprivate-name" },
    "history",
  ],
  [
    "divergent history",
    {
      status: 1,
      stderr:
        "Your local migration history and the migrations table from your database are different:",
    },
    "history",
  ],
  [
    "missing CLI",
    {
      status: null,
      error: Object.assign(new Error("private-path"), { code: "ENOENT" }),
    },
    "engine",
  ],
  [
    "binary blocked",
    {
      status: null,
      error: Object.assign(new Error("private-path"), { code: "EACCES" }),
    },
    "engine",
  ],
  [
    "missing engine",
    {
      status: 1,
      stderr: "Could not find schema-engine binary at private-path",
    },
    "engine",
  ],
  [
    "engine download",
    {
      status: 1,
      stderr:
        "Failed to fetch sha256 checksum at https://binaries.prisma.sh/private-path",
    },
    "engine",
  ],
  [
    "engine download request",
    {
      status: 1,
      stderr:
        "request to https://binaries.prisma.sh/private-path failed, reason: private",
    },
    "engine",
  ],
  ["killed process", { status: null, signal: "SIGTERM" }, "process"],
  [
    "generic process error",
    { status: null, error: new Error("private-detail") },
    "process",
  ],
  ["unknown", { status: 1, stderr: "Unknown driver detail" }, "unknown"],
  [
    "pending with credentials error",
    { status: 1, stdout: pending, stderr: "Error: P1000" },
    "credentials",
  ],
  [
    "pending with history error",
    { status: 1, stdout: pending, stderr: "Error: P3009" },
    "history",
  ],
  [
    "pending with unknown Prisma error",
    { status: 1, stdout: pending, stderr: "Error: P9999" },
    "unknown",
  ],
  [
    "pending with generic error",
    { status: 1, stdout: pending, stderr: "Error: private driver failure" },
    "unknown",
  ],
  ["pending with wrong exit status", { status: 2, stdout: pending }, "unknown"],
];

for (const [name, result, kind] of diagnostics) {
  test(`safe diagnostic: ${name}`, () => {
    const mock = harness(result);
    const exitCode = runMigration("status", env, mock.dependencies);
    assert.equal(
      exitCode,
      result.status && result.status > 0 ? result.status : 1,
    );
    assert.equal(mock.logs.length, 0);
    assert.equal(mock.errors.length, 1);
    assert.ok(mock.errors[0].startsWith(`[migration:${kind}]`));
    assert.doesNotMatch(
      mock.errors[0],
      /private-|sqlserver:\/\/|https:\/\/|password=/,
    );
  });
}

test("deploy failure is never described as merely pending", () => {
  const mock = harness({ status: 1, stdout: pending });
  assert.equal(runMigration("deploy", env, mock.dependencies), 1);
  assert.match(mock.errors[0], /^\[migration:unknown\]/);
});

test("exceptions from CLI resolution and process execution remain private", () => {
  for (const stage of ["resolveCli", "spawn"] as const) {
    const mock = harness();
    mock.dependencies[stage] = () => {
      throw new Error(`${migrationUrl}\n${runtimeUrl}\nprivate-token`);
    };
    assert.equal(runMigration("deploy", env, mock.dependencies), 1);
    assert.match(
      mock.errors[0],
      stage === "resolveCli"
        ? /^\[migration:engine\]/
        : /^\[migration:process\]/,
    );
    assert.doesNotMatch(
      mock.errors[0],
      /sqlserver:\/\/|fixture|private-token|password=/,
    );
    assert.equal(mock.logs.length, 0);
  }
});

test("raw Prisma output and exception stacks never reach either console channel", () => {
  const sensitive = `${migrationUrl}\n${runtimeUrl}\npassword=fixture-only\nAuthorization: Bearer fixture-token\nJWT_ACCESS_SECRET=fixture-key\nTOKEN=fixture-token\nprivate-migration-name`;
  for (const action of ["status", "deploy"] as const) {
    for (const result of [
      { status: 0, stdout: sensitive, stderr: sensitive },
      { status: 1, stdout: sensitive, stderr: `Error: P1000\n${sensitive}` },
      { status: 1, stdout: sensitive, stderr: sensitive },
      {
        status: null,
        error: new Error(sensitive),
        stdout: sensitive,
        stderr: sensitive,
      },
    ]) {
      const mock = harness(result);
      runMigration(
        action,
        { ...env, JWT_ACCESS_SECRET: "fixture-key" },
        mock.dependencies,
      );
      const printed = [...mock.logs, ...mock.errors].join("\n");
      assert.doesNotMatch(
        printed,
        /sqlserver:\/\/|password=|Bearer|fixture-|JWT_ACCESS_SECRET|TOKEN=|private-migration-name/,
      );
    }
  }
});

test("missing, invalid and misleading zero exit statuses cannot hide failures", () => {
  for (const status of [null, -1, 256, NaN, 1.5]) {
    assert.equal(
      runMigration("status", env, harness({ status }).dependencies),
      1,
    );
  }
  for (const result of [
    { status: 0, error: new Error("fixture-failure") },
    { status: 0, signal: "SIGTERM" },
  ]) {
    const mock = harness(result);
    assert.equal(runMigration("status", env, mock.dependencies), 1);
    assert.equal(mock.logs.length, 0);
  }
  assert.equal(
    runMigration("status", env, harness({ status: 7 }).dependencies),
    7,
  );
});

test("importing the CLI entrypoint has no dotenv or process side effects", async () => {
  const before = { ...process.env };
  const exitCode = process.exitCode;
  await import("../scripts/migrate");
  assert.deepEqual({ ...process.env }, before);
  assert.equal(process.exitCode, exitCode);
});

test("existing npm commands and the checked-in template retain the protected runner", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["db:migrate:status"],
    "tsx scripts/migrate.ts status",
  );
  assert.equal(
    pkg.scripts["db:migrate:deploy"],
    "tsx scripts/migrate.ts deploy",
  );
  const template = readFileSync(".env.migrations.example", "utf8");
  assert.match(
    template,
    /sqlserver:\/\/127\.0\.0\.1:15433;database=OminiDB;user=omini_migrator;/,
  );
  assert.doesNotMatch(template, /:1433/);
});
