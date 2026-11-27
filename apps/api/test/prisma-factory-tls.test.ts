import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { test, TestContext } from "node:test";
import { validateEnvironment } from "../src/config";
import { createDatabaseClient } from "../src/persistence/prisma.factory";
import { parseSqlServerUrl } from "../src/persistence/sqlserver-url";

type PoolConfig = ReturnType<typeof parseSqlServerUrl> & {
  options: { serverName?: string };
};
type Pool = { config: PoolConfig; connect(): Promise<unknown> };

// Resolve the same driver instance used by the pinned Prisma adapter. Intercept
// its public connection boundary: real Prisma/adapter configuration, no TCP/SQL.
const { ConnectionPool } = createRequire(
  require.resolve("@prisma/adapter-mssql"),
)("mssql") as { ConnectionPool: { prototype: Pool } };

const runtimeUrl =
  "sqlserver://127.0.0.1:15433;database=OminiDB;user=omini_app;password={fixture;only}}value};encrypt=true;trustServerCertificate=false;connectionTimeout=7000";

async function observeDriverConfig(t: TestContext, url: string) {
  const configs: PoolConfig[] = [];
  t.mock.method(
    ConnectionPool.prototype,
    "connect",
    async function (this: Pool) {
      configs.push(this.config);
      throw new Error("Offline regression: pool connection blocked by test");
    },
  );
  const client = createDatabaseClient(url);
  try {
    assert.equal(configs.length, 0, "Client construction must stay lazy");
    await assert.rejects(
      client.$connect(),
      /Offline regression: pool connection blocked by test/,
    );
    assert.equal(configs.length, 1, "No alternate connection or retry target");
    return configs[0];
  } finally {
    await client.$disconnect();
  }
}

for (const trustServerCertificate of [false, true])
  test(`Prisma forwards DNS TLS serverName for Node 26 without changing the isolated TCP target (trust=${trustServerCertificate})`, async (t) => {
    const url = runtimeUrl.replace(
      "trustServerCertificate=false",
      `trustServerCertificate=${trustServerCertificate}`,
    );
    const config = await observeDriverConfig(t, url);
    assert.equal(config.server, "127.0.0.1");
    assert.equal(config.port, 15433);
    assert.equal(config.database, "OminiDB");
    assert.equal(config.user, "omini_app");
    assert.equal(config.password, "fixture;only}value");
    assert.equal(config.options.serverName, "localhost");
    assert.equal(isIP(config.options.serverName), 0);
    assert.equal(config.options.encrypt, true);
    assert.equal(config.options.trustServerCertificate, trustServerCertificate);
    assert.equal(config.connectionTimeout, 7000);
    assert.equal(config.requestTimeout, 5000);
  });

test("test TLS configuration preserves certificate verification by default", async (t) => {
  const config = await observeDriverConfig(
    t,
    runtimeUrl.replace(";trustServerCertificate=false", ""),
  );
  assert.equal(config.options.encrypt, true);
  assert.equal(config.options.trustServerCertificate, false);
  assert.equal(config.options.serverName, "localhost");
});

for (const authority of [
  "127.0.0.1:1433",
  "127.0.0.1:15434",
  "localhost:15433",
  "sql.example.invalid:15433",
  "192.0.2.10:15433",
])
  test(`local TLS override never rewrites another configured target: ${authority}`, async (t) => {
    // These fixtures are observed at the mocked pool boundary only. None of
    // these addresses may be contacted, including the forbidden main port.
    const url = runtimeUrl.replace("127.0.0.1:15433", authority);
    const expected = parseSqlServerUrl(url);
    const config = await observeDriverConfig(t, url);
    assert.equal(config.server, expected.server);
    assert.equal(config.port, expected.port);
    assert.equal(config.options.serverName, undefined);
    assert.equal(config.options.encrypt, true);
    assert.equal(config.options.trustServerCertificate, false);
  });

test("TLS override does not bypass the existing strict Phase 2.6 activation guard", () => {
  const env = {
    NODE_ENV: "development",
    REVIEWS_V2_ENABLED: "true",
    AUTH_ENABLED: "true",
    PERSISTENCE_ENABLED: "true",
    PORT: "3001",
    JWT_ACCESS_SECRET: "fixture-only-".repeat(6),
    DATABASE_URL: runtimeUrl,
  };
  assert.equal(validateEnvironment(env).REVIEWS_V2_ENABLED, true);
  for (const [from, to] of [
    [":15433", ":1433"],
    [":15433", ":15434"],
    ["127.0.0.1", "localhost"],
    ["127.0.0.1", "sql.example.invalid"],
    ["OminiDB", "OtherDB"],
    ["omini_app", "omini_migrator"],
    ["encrypt=true", "encrypt=false"],
  ]) {
    const url = runtimeUrl.replace(from, to);
    assert.throws(
      () => validateEnvironment({ ...env, DATABASE_URL: url }),
      (error: Error) =>
        !error.message.includes("sqlserver://") &&
        !error.message.includes("fixture"),
    );
  }
  assert.throws(() => validateEnvironment({ ...env, NODE_ENV: "production" }));
  assert.throws(() => validateEnvironment({ ...env, PORT: "3000" }));
});

test("invalid or unencrypted URLs fail before the driver can be connected", () => {
  for (const url of [
    "",
    runtimeUrl.replace("encrypt=true", "encrypt=false"),
    runtimeUrl + ";serverName=other.invalid",
    runtimeUrl + ";port=1433",
    runtimeUrl + ";encrypt=true",
  ])
    assert.throws(
      () => createDatabaseClient(url),
      (error: Error) =>
        !error.message.includes("sqlserver://") &&
        !error.message.includes("fixture"),
    );
});
