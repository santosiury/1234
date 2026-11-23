import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaRequestsRepository } from "../src/requests/prisma-requests.repository";
import { PrismaService } from "../src/persistence/prisma.service";
test("Prisma requests use Serializable transactions, bound location values, database UTC and compare-and-set", async () => {
  const sql: { text: string; values: unknown[] }[] = [];
  let cas: unknown;
  const instant = new Date("2026-11-12T12:00:00Z");
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sql.push({ text: strings.join("?"), values });
      return strings.join("").includes("SYSUTCDATETIME")
        ? [{ now: instant }]
        : [{ id: "area" }];
    },
    providerService: {
      findFirst: async (input: unknown) => {
        assert.match(JSON.stringify(input), /"category":\{"isActive":true\}/);
        assert.match(JSON.stringify(input), /"user":\{"isActive":true\}/);
        return {
          title: "Tomadas",
          provider: { userId: "owner", professionalName: "Profissional" },
        };
      },
    },
    serviceRequest: {
      updateMany: async (input: unknown) => {
        cas = input;
        return { count: 0 };
      },
    },
  };
  const service = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No connection");
    },
  );
  service.orm = () =>
    ({
      $transaction: async (
        run: (tx: typeof db) => Promise<unknown>,
        options: unknown,
      ) => {
        assert.deepEqual(options, {
          isolationLevel: "Serializable",
          maxWait: 5000,
          timeout: 15000,
        });
        return run(db);
      },
    }) as unknown as PrismaClient;
  const repo = new PrismaRequestsRepository(service);
  await repo.transaction(async (tx) => {
    assert.equal(await tx.now(), instant);
    const city = "Ararangua' OR 1=1 --",
      neighborhood = "Centro_%";
    const target = await tx.target({
      providerId: "provider",
      providerServiceId: "service",
      city,
      state: "SC",
      neighborhood,
      description: "Test request",
      idempotencyKey: "key",
    });
    assert.equal(target?.providerUserId, "owner");
    assert.ok(
      !sql[1].text.includes(city) && !sql[1].text.includes(neighborhood),
    );
    assert.ok(
      sql[1].values.includes(city) && !sql[1].values.includes(neighborhood),
    );
    assert.ok(!sql[1].text.includes("neighborhood"));
    assert.match(sql[1].text, /\[state\] COLLATE Latin1_General_100_CI_AI/);
    assert.match(sql[1].text, /\[isActive\]=1/);
    assert.equal(
      await tx.patch("request", "REQUESTED", 7, {
        status: "ACCEPTED",
        version: 8,
        updatedAt: instant,
        acceptedAt: instant,
      }),
      0,
    );
  });
  assert.deepEqual(cas, {
    where: { id: "request", status: "REQUESTED", version: 7 },
    data: {
      status: "ACCEPTED",
      version: 8,
      updatedAt: instant,
      acceptedAt: instant,
    },
  });
});

test("Prisma event writer forwards cancellation reason/context unchanged and uses the existing Serializable unit of work without SQL execution", async () => {
  let inserted: unknown;
  const now = new Date("2026-11-23T12:00:00Z");
  const db = {
    serviceRequestEvent: {
      create: async ({ data }: { data: unknown }) => {
        inserted = data;
        return { id: "event", ...(data as object) };
      },
    },
  };
  const service = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No connection permitted");
    },
  );
  service.orm = () =>
    ({
      $transaction: async (
        run: (tx: typeof db) => Promise<unknown>,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, "Serializable");
        return run(db);
      },
    }) as unknown as PrismaClient;
  const repository = new PrismaRequestsRepository(service);
  const data = {
    requestId: "request",
    actorUserId: "provider",
    previousStatus: "AWAITING_CONFIRMATION",
    newStatus: "CANCELLED",
    action: "cancel",
    occurredAt: now,
    reason: "Não chegamos a um acordo sobre o valor",
    reasonCode: "PRICE_DISAGREEMENT",
    executionContext: "FULL_CLAIMED",
    version: 5,
    idempotencyKey: "key",
    payloadHash: "a".repeat(64),
  };
  const row = await repository.transaction((tx) => tx.append(data));
  assert.deepEqual(inserted, data);
  assert.equal(row.reasonCode, "PRICE_DISAGREEMENT");
  assert.equal(row.executionContext, "FULL_CLAIMED");
  assert.equal(row.occurredAt, now);
});
