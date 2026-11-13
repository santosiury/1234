import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { catalogWhere, literalPattern } from "../src/marketplace/catalog-query";
import { PrismaMarketplaceRepository } from "../src/marketplace/prisma-marketplace.repository";
import { catalogQuerySchema } from "../src/marketplace/validation";
import { PrismaService } from "../src/persistence/prisma.service";
import { ApiError } from "../src/api-error";
function repository(client: object) {
  const service = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No database connection allowed");
    },
  );
  service.orm = () => client as PrismaClient;
  return new PrismaMarketplaceRepository(service);
}
test("SQL catalog query binds every user value, escapes LIKE literals and filters location in one EXISTS", () => {
  const injection = "João_%[~' OR 1=1 --";
  const query = catalogWhere(
    catalogQuerySchema.parse({
      q: injection,
      city: "Araranguá",
      state: "sc",
      neighborhood: "Centro",
      categoryId: randomUUID(),
    }),
  );
  assert.ok(!query.sql.includes(injection));
  assert.ok(query.values.includes(literalPattern(injection)));
  assert.match(query.sql, /COLLATE Latin1_General_100_CI_AI/);
  assert.match(query.sql, /ESCAPE N'~'/);
  assert.equal(
    (query.sql.match(/FROM \[dbo\]\.\[ProviderServiceArea\]/g) ?? []).length,
    1,
  );
  assert.match(query.sql, /a\.\[city\].+a\.\[state\]/s);
  assert.ok(!query.sql.includes("neighborhood"));
  assert.ok(!query.values.includes("Centro"));
  assert.match(query.sql, /a\.\[isActive\] = 1/);
  assert.match(query.sql, /c\.\[isActive\] = 1/);
  assert.match(query.sql, /u\.\[isActive\] = 1/);
  assert.equal(literalPattern("50%_[~"), "%50~%~_~[~~%");
});
test("Prisma catalog projects only public fields and restores SQL ordering even when the ORM returns ids in reverse/case variants", async () => {
  const first = randomUUID(),
    second = randomUUID();
  const calls: Prisma.Sql[] = [];
  const raw = async (input: TemplateStringsArray, ...values: unknown[]) => {
    const query = Prisma.sql(input, ...values);
    calls.push(query);
    return query.sql.includes("COUNT(*)")
      ? [{ total: 2 }]
      : [{ id: first.toUpperCase() }, { id: second.toUpperCase() }];
  };
  const repo = repository({
    $queryRaw: raw,
    providerProfile: {
      findMany: async (input: Prisma.ProviderProfileFindManyArgs) => {
        const select = input.select!;
        assert.deepEqual(Object.keys(select).sort(), [
          "bio",
          "id",
          "professionalName",
          "serviceAreas",
          "services",
        ]);
        assert.deepEqual(input.where?.user, { isActive: true });
        assert.deepEqual((select.services as { where: unknown }).where, {
          isActive: true,
          category: { isActive: true },
        });
        return [second, first].map((id) => ({
          id,
          professionalName: id,
          bio: null,
          services: [],
          serviceAreas: [],
        }));
      },
    },
  });
  const result = await repo.list(
    catalogQuerySchema.parse({ page: 2, pageSize: 2 }),
  );
  assert.deepEqual(
    result.items.map((p) => p.id),
    [first, second],
  );
  assert.match(
    calls[1].sql,
    /ORDER BY p\.\[professionalName\] COLLATE Latin1_General_100_CI_AI ASC, p\.\[id\] ASC/,
  );
  assert.deepEqual(calls[1].values.slice(-2), [2, 2]);
});
test("Prisma ownership is checked transactionally before any service or area update, with no write for foreign ids", async () => {
  const uid = randomUUID(),
    pid = randomUUID();
  let writes = 0;
  let serializable = 0;
  const tx = {
    providerProfile: {
      findFirst: async (input: Prisma.ProviderProfileFindFirstArgs) => {
        assert.deepEqual(input.where, {
          userId: uid,
          isActive: true,
          user: { isActive: true },
        });
        return { id: pid };
      },
    },
    providerService: {
      findFirst: async (input: Prisma.ProviderServiceFindFirstArgs) => {
        assert.equal(input.where?.providerId, pid);
        return null;
      },
      update: async () => {
        writes++;
      },
    },
    providerServiceArea: {
      findFirst: async (input: Prisma.ProviderServiceAreaFindFirstArgs) => {
        assert.equal(input.where?.providerId, pid);
        return null;
      },
      update: async () => {
        writes++;
      },
    },
  };
  const repo = repository({
    $transaction: async (
      operation: (v: typeof tx) => Promise<unknown>,
      options: { isolationLevel: string },
    ) => {
      assert.equal(options.isolationLevel, "Serializable");
      serializable++;
      return operation(tx);
    },
  });
  await assert.rejects(
    repo.updateService(uid, randomUUID(), { isActive: false }),
    (e) => e instanceof ApiError && e.getStatus() === 404,
  );
  await assert.rejects(
    repo.updateArea(uid, randomUUID(), { isActive: false }),
    (e) => e instanceof ApiError && e.getStatus() === 404,
  );
  assert.equal(writes, 0);
  assert.equal(serializable, 2);
});
test("Prisma creation derives provider ownership, validates the category and uses INSERT/UPDATE without DELETE", async () => {
  const uid = randomUUID(),
    pid = randomUUID(),
    cid = randomUUID();
  const writes: unknown[] = [];
  const tx = {
    providerProfile: { findFirst: async () => ({ id: pid }) },
    serviceCategory: { findFirst: async () => ({ id: cid }) },
    providerService: {
      count: async () => 0,
      create: async (input: unknown) => {
        writes.push(input);
        return input;
      },
    },
    providerServiceArea: {
      findMany: async () => [],
      create: async (input: unknown) => {
        writes.push(input);
        return {
          id: randomUUID(),
          city: "Araranguá",
          state: "SC",
          isActive: true,
          neighborhood: "",
        };
      },
    },
  };
  const repo = repository({
    $transaction: async (operation: (v: typeof tx) => Promise<unknown>) =>
      operation(tx),
  });
  await repo.createService(uid, { categoryId: cid, title: "Elétrica" });
  await repo.createArea(uid, { city: "Araranguá", state: "SC" });
  assert.deepEqual(writes, [
    {
      data: { categoryId: cid, title: "Elétrica", providerId: pid },
      select: {
        id: true,
        categoryId: true,
        title: true,
        description: true,
        isActive: true,
        category: {
          select: { id: true, slug: true, name: true, isActive: true },
        },
      },
    },
    {
      data: {
        city: "Araranguá",
        state: "SC",
        isActive: undefined,
        neighborhood: "",
        providerId: pid,
      },
      select: {
        id: true,
        city: true,
        state: true,
        isActive: true,
      },
    },
  ]);
});

test("Prisma collection limits reject new services and areas before any write", async () => {
  let writes = 0;
  const tx = {
    providerProfile: { findFirst: async () => ({ id: randomUUID() }) },
    serviceCategory: { findFirst: async () => ({ id: randomUUID() }) },
    providerService: {
      count: async () => 50,
      create: async () => {
        writes++;
      },
    },
    providerServiceArea: {
      findMany: async () =>
        Array.from({ length: 50 }, (_, i) => ({
          id: randomUUID(),
          city: `Cidade ${i}`,
          state: "SC",
          isActive: true,
          neighborhood: "",
        })),
      create: async () => {
        writes++;
      },
    },
  };
  const repo = repository({
    $transaction: async (operation: (value: typeof tx) => Promise<unknown>) =>
      operation(tx),
  });
  await assert.rejects(
    repo.createService(randomUUID(), {
      categoryId: randomUUID(),
      title: "Serviço",
    }),
    (e) => e instanceof ApiError && e.code === "LIMIT_REACHED",
  );
  await assert.rejects(
    repo.createArea(randomUUID(), { city: "Araranguá", state: "SC" }),
    (e) => e instanceof ApiError && e.code === "LIMIT_REACHED",
  );
  assert.equal(writes, 0);
});
