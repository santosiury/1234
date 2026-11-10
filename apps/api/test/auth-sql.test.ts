import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { getDMMF } from "@prisma/internals";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository";
import { PrismaService } from "../src/persistence/prisma.service";
import { validateInitialMigration } from "../scripts/migration-validation";
const user = {
  id: "user-id",
  email: "test@example.test",
  displayName: "Teste",
  isActive: true,
  clientProfile: { isActive: true },
  providerProfile: null,
};
function fixture(consumed: boolean, count: number) {
  const calls: string[] = [];
  const tx = {
    refreshToken: {
      findUnique: async () => ({
        id: "token-id",
        sessionId: "session-id",
        consumedAt: consumed ? new Date() : null,
        expiresAt: new Date(Date.now() + 100000),
        session: {
          id: "session-id",
          expiresAt: new Date(Date.now() + 100000),
          revokedAt: null,
          user,
        },
      }),
      updateMany: async (input: unknown) => {
        assert.deepEqual(
          input && typeof input === "object" && "where" in input
            ? input.where
            : null,
          { id: "token-id", consumedAt: null },
        );
        calls.push("consume");
        return { count };
      },
      create: async () => {
        calls.push("create");
      },
    },
    authSession: {
      update: async () => {
        calls.push("revoke");
      },
    },
  };
  const service = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No SQL");
    },
  );
  service.orm = () =>
    ({
      $transaction: async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    }) as unknown as PrismaClient;
  return { repository: new PrismaAuthRepository(service), calls };
}
test("SQL repository commits family revocation on replay or compare-and-set failure", async () => {
  for (const [consumed, count] of [
    [true, 1],
    [false, 0],
  ] as const) {
    const f = fixture(consumed, count);
    assert.equal(await f.repository.rotate("hash", "next", new Date()), null);
    assert.ok(f.calls.includes("revoke"));
    assert.ok(!f.calls.includes("create"));
  }
});
test("SQL repository consumes conditionally before creating one successor", async () => {
  const f = fixture(false, 1);
  const result = await f.repository.rotate("hash", "next", new Date());
  assert.equal(result?.id, "session-id");
  assert.deepEqual(f.calls, ["consume", "create"]);
});
test("incremental auth SQL preserves original tables, indexes, seed and providers", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const old = await readFile("prisma/history/phase21.prisma.snapshot", "utf8");
  const current = await getDMMF({ datamodel: schema });
  const prior = await getDMMF({ datamodel: old });
  for (const model of prior.datamodel.models) {
    const next = current.datamodel.models.find(
      (item) => item.name === model.name,
    )!;
    assert.deepEqual(
      next.fields.filter((field) => field.kind === "scalar"),
      model.fields.filter((field) => field.kind === "scalar"),
    );
  }
  assert.deepEqual(
    current.datamodel.indexes.filter((index) =>
      prior.datamodel.models.some((model) => model.name === index.model),
    ),
    prior.datamodel.indexes,
  );
  const initial = await readFile(
    "prisma/migrations/20261109000000_persistence_foundation/migration.sql",
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(initial.replace(/\r\n/g, "\n")).digest("hex"),
    "e2244f55428f92df8d69e2d841b45cb8bb8ef49d9870bd551267c51dc5ccd2ff",
  );
  const sql = await readFile(
    "prisma/migrations/20261110000000_authentication/migration.sql",
    "utf8",
  );
  await validateInitialMigration(schema, sql, [
    "AuthCredential",
    "AuthSession",
    "RefreshToken",
  ]);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE \[dbo\]\.\[(User|ClientProfile|ProviderProfile|ServiceCategory|ProviderService|ProviderServiceArea)\]/,
  );
  assert.match(schema, /provider\s*=\s*"sqlserver"/);
  assert.match(
    await readFile("prisma/migrations/migration_lock.toml", "utf8"),
    /provider\s*=\s*"mssql"/,
  );
});
