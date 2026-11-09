import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Logger, NotFoundException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { Prisma } from "@prisma/client";
import { migrationEnvironment } from "../scripts/migration-env";
import {
  createDatabaseClient,
  DATABASE_CLIENT_FACTORY,
  DatabaseClient,
} from "../src/persistence/prisma.factory";
import { PrismaService } from "../src/persistence/prisma.service";
import { DatabaseController } from "../src/persistence/database.controller";
import { validateEnvironment } from "../src/config";
import { parseSqlServerUrl } from "../src/persistence/sqlserver-url";
function fakeClient(fail: boolean) {
  const calls = { connected: 0, disconnected: 0, queries: 0 };
  const client: DatabaseClient = {
    $connect: async () => {
      calls.connected++;
      if (fail) throw new Error("sensitive-driver-detail");
    },
    $disconnect: async () => {
      calls.disconnected++;
    },
    $queryRaw: (async (sql: TemplateStringsArray) => {
      calls.queries++;
      assert.equal(sql.join(""), "SELECT 1 AS connected");
      if (fail) throw new Error("sensitive-driver-detail");
      return [];
    }) as DatabaseClient["$queryRaw"],
  };
  return { client, calls };
}
test("SQL Server URL handles braced delimiters without logging values", () => {
  const url =
    "sqlserver://127.0.0.1:1433;database=OminiDB;user=omini_app;password={example;a=b}}c};encrypt=true;trustServerCertificate=true";
  const config = parseSqlServerUrl(url);
  assert.equal(config.password, "example;a=b}c");
  assert.equal(config.port, 1433);
  assert.equal(config.options.encrypt, true);
  for (const suffix of [
    "password={unclosed",
    "password=x;password=y",
    "password=x;encrypt=false",
    "password=x;unknown=secret",
    "password=x;connectionTimeout=NaN",
  ]) {
    assert.throws(
      () =>
        parseSqlServerUrl(
          "sqlserver://127.0.0.1:1433;database=OminiDB;user=test;" + suffix,
        ),
      (e) => e instanceof Error && !e.message.includes("secret"),
    );
  }
});
test("configuration is opt-in and rejects ambiguous flags or missing runtime URL", () => {
  assert.equal(validateEnvironment({}).PERSISTENCE_ENABLED, false);
  assert.throws(() => validateEnvironment({ PERSISTENCE_ENABLED: "yes" }));
  assert.throws(() => validateEnvironment({ PERSISTENCE_ENABLED: "true" }));
  assert.throws(() => validateEnvironment({ DB_DIAGNOSTICS_ENABLED: "1" }));
});
test("demo mode never instantiates a connection; lifecycle closes an enabled connection", async () => {
  const disabled = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw new Error("Must not instantiate");
    },
  );
  await disabled.onModuleInit();
  assert.equal(await disabled.diagnose(), "disabled");
  await disabled.onModuleDestroy();
  const { client, calls } = fakeClient(false);
  const enabled = new PrismaService(
    new ConfigService({
      PERSISTENCE_ENABLED: true,
      DATABASE_URL: "placeholder",
    }),
    () => client,
  );
  await enabled.onModuleInit();
  assert.equal(await enabled.diagnose(), "ok");
  await enabled.onModuleDestroy();
  assert.deepEqual(calls, { connected: 1, disconnected: 1, queries: 1 });
});
for (const fail of [false, true])
  test(`database diagnostic is sanitized, liveness independent (connection failure=${fail})`, async () => {
    const { client, calls } = fakeClient(fail);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          PORT: 0,
          NODE_ENV: "development",
          PERSISTENCE_ENABLED: true,
          DB_DIAGNOSTICS_ENABLED: true,
          DATABASE_URL: "placeholder",
          CORS_ORIGINS: [],
        }),
      )
      .overrideProvider(DATABASE_CLIENT_FACTORY)
      .useValue(() => client)
      .compile();
    const app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    try {
      const base = await app.getUrl();
      const response = await fetch(`${base}/api/development/database`);
      const body = await response.text();
      assert.equal(response.status, fail ? 503 : 200);
      assert.ok(!body.includes("sensitive-driver-detail"));
      assert.ok(!body.includes("placeholder"));
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
      const spec = await (await fetch(`${base}/docs-json`)).json();
      assert.equal(spec.paths["/api/development/database"], undefined);
      assert.equal(calls.connected, 1);
      assert.equal(calls.queries, 1);
    } finally {
      await app.close();
    }
    assert.equal(calls.disconnected, 1);
  });
test("database diagnostic requires development, opt-in and loopback", async () => {
  const fake = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw new Error("No connection");
    },
  );
  for (const [nodeEnv, flag, ip] of [
    ["production", true, "127.0.0.1"],
    ["development", false, "127.0.0.1"],
    ["development", true, "192.168.1.2"],
  ] as const) {
    const controller = new DatabaseController(
      new ConfigService({ NODE_ENV: nodeEnv, DB_DIAGNOSTICS_ENABLED: flag }),
      fake,
    );
    await assert.rejects(controller.diagnose(ip), NotFoundException);
  }
  const controller = new DatabaseController(
    new ConfigService({
      NODE_ENV: "development",
      DB_DIAGNOSTICS_ENABLED: true,
    }),
    fake,
  );
  assert.equal((await controller.diagnose("::1")).status, "disabled");
});
test("connection and disconnect failures do not leak driver messages in warnings", async () => {
  const messages: unknown[] = [];
  const original = Logger.prototype.warn;
  Logger.prototype.warn = function (message: unknown) {
    messages.push(message);
  };
  try {
    const service = new PrismaService(
      new ConfigService({ PERSISTENCE_ENABLED: true, DATABASE_URL: "private" }),
      () => ({
        ...fakeClient(true).client,
        $disconnect: async () => {
          throw new Error("private");
        },
      }),
    );
    await service.onModuleInit();
    await service.onModuleDestroy();
    assert.equal(messages.length, 2);
    assert.ok(!JSON.stringify(messages).includes("private"));
    assert.ok(!JSON.stringify(messages).includes("sensitive-driver-detail"));
  } finally {
    Logger.prototype.warn = original;
  }
});

test("generated SQL Server client exposes the six models without connecting", async () => {
  assert.equal(Object.keys(Prisma.ModelName).length, 6);
  const client = createDatabaseClient(
    "sqlserver://not-used.invalid:1433;database=OminiDB;user=fixture;password={fixture};encrypt=true",
  );
  assert.ok("user" in client);
  assert.ok("providerServiceArea" in client);
  await client.$disconnect();
});
test("migration identity never falls back to runtime and rejects the wrong database", () => {
  const runtime =
    "sqlserver://127.0.0.1:1433;database=OminiDB;user=omini_app;password={fixture}";
  const migration = runtime.replace("omini_app", "omini_migrator");
  assert.throws(() => migrationEnvironment({ DATABASE_URL: runtime }));
  assert.throws(() =>
    migrationEnvironment({ MIGRATION_DATABASE_URL: runtime }),
  );
  assert.throws(() =>
    migrationEnvironment({
      MIGRATION_DATABASE_URL: migration.replace("OminiDB", "OtherDB"),
    }),
  );
  const env = migrationEnvironment({
    DATABASE_URL: runtime,
    MIGRATION_DATABASE_URL: migration,
  });
  assert.equal(env.DATABASE_URL, migration);
  assert.equal(env.MIGRATION_DATABASE_URL, undefined);
});
