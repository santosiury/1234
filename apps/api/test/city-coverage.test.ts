import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { cityAreas, cityKey, cityLocation } from "@omini/shared";
import { PrismaService } from "../src/persistence/prisma.service";
import { PrismaMarketplaceRepository } from "../src/marketplace/prisma-marketplace.repository";
import { ApiError } from "../src/api-error";
import {
  areaSchema,
  updateAreaSchema,
  catalogQuerySchema,
} from "../src/marketplace/validation";
interface Area {
  id: string;
  providerId: string;
  city: string;
  state: string;
  neighborhood: string;
  isActive: boolean;
}
const pid = randomUUID(),
  uid = randomUUID();
function legacy(
  city = "Araranguá",
  neighborhood = "Centro",
  isActive = true,
): Area {
  return {
    id: randomUUID(),
    providerId: pid,
    city,
    state: "SC",
    neighborhood,
    isActive,
  };
}
function fixture(initial: Area[]) {
  const rows = structuredClone(initial),
    writes: unknown[] = [];
  const tx = {
    providerProfile: {
      findFirst: async () => ({
        id: pid,
        professionalName: "Profissional",
        bio: null,
        isActive: true,
        services: [],
        serviceAreas: structuredClone(rows.filter((r) => r.providerId === pid)),
      }),
    },
    providerServiceArea: {
      findMany: async () =>
        structuredClone(rows.filter((r) => r.providerId === pid)),
      findFirst: async ({
        where,
      }: {
        where: { id: string; providerId: string };
      }) =>
        structuredClone(
          rows.find(
            (r) => r.id === where.id && r.providerId === where.providerId,
          ) ?? null,
        ),
      create: async ({
        data,
      }: {
        data: Omit<Area, "id" | "isActive"> & { isActive?: boolean };
      }) => {
        writes.push({ create: data });
        const row = {
          ...data,
          isActive: data.isActive ?? true,
          id: randomUUID(),
        };
        rows.push(row);
        return structuredClone(row);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { providerId: string; id: { in: string[] } };
        data: Partial<Area>;
      }) => {
        writes.push({ where, data });
        let count = 0;
        for (const row of rows)
          if (
            row.providerId === where.providerId &&
            where.id.in.includes(row.id)
          ) {
            Object.assign(row, data);
            count++;
          }
        return { count };
      },
    },
  };
  const db = new PrismaService(
    new ConfigService({ PERSISTENCE_ENABLED: false }),
    () => {
      throw Error("No database allowed");
    },
  );
  db.orm = () =>
    ({
      ...tx,
      $transaction: async (
        run: (v: typeof tx) => Promise<unknown>,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, "Serializable");
        return run(tx);
      },
    }) as unknown as PrismaClient;
  return { repo: new PrismaMarketplaceRepository(db), rows, writes };
}
test("city normalization deduplicates legacy districts, uses any active row and stable IDs independent of input order", () => {
  const rows = [
    {
      ...legacy("ARARANGUA", "Centro", false),
      id: "10000000-0000-4000-8000-000000000001",
    },
    {
      ...legacy("Araranguá", "Polícia rodoviária"),
      id: "10000000-0000-4000-8000-000000000002",
    },
    legacy("Criciúma", "Próspera"),
  ];
  const result = cityAreas(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].isActive, true);
  assert.equal(result[0].id, rows[0].id);
  assert.ok(!("neighborhood" in result[0]));
  assert.deepEqual(cityAreas([...rows].reverse()), result);
  assert.equal(
    cityKey({ city: "  Araranguá  ", state: "sc" }),
    cityKey({ city: "ARARANGUA", state: "SC" }),
  );
  assert.equal(cityLocation({ city: ["Araranguá"], state: "SC" }), null);
  assert.equal(cityLocation({ city: "Sombrio", state: "ZZ" }), null);
});
test("creating cities rejects active and inactive accent/case duplicates while allowing additional municipalities", async () => {
  const f = fixture([legacy()]);
  await assert.rejects(
    f.repo.createArea(uid, { city: "ARARANGUA", state: "SC" }),
    (e) => e instanceof ApiError && e.getStatus() === 409,
  );
  f.rows[0].isActive = false;
  await assert.rejects(
    f.repo.createArea(uid, { city: "araranguá", state: "SC" }),
    (e) => e instanceof ApiError && e.code === "DUPLICATE_RECORD",
  );
  const result = await f.repo.createArea(uid, {
    city: "Criciúma",
    state: "SC",
    neighborhood: "Legacy input ignored",
  });
  assert.equal(result.city, "Criciúma");
  assert.ok(!("neighborhood" in result));
  assert.equal(f.rows[1].neighborhood, "");
  assert.equal(f.rows.length, 2);
});
test("city deactivation and activation update all legacy rows, never another city/provider and retain every district", async () => {
  const rows = [
      legacy("Araranguá", "Centro", false),
      legacy("ARARANGUA", "Polícia rodoviária"),
      legacy("Sombrio"),
      { ...legacy(), providerId: randomUUID() },
    ],
    f = fixture(rows);
  assert.equal(
    (await f.repo.own(uid)).areas.find((a) => cityKey(a) === cityKey(rows[0]))
      ?.isActive,
    true,
  );
  const off = await f.repo.updateArea(uid, rows[0].id, { isActive: false });
  assert.equal(off.isActive, false);
  assert.deepEqual(
    f.rows.map((r) => r.isActive),
    [false, false, true, true],
  );
  const on = await f.repo.updateArea(uid, rows[1].id, { isActive: true });
  assert.equal(on.isActive, true);
  assert.deepEqual(
    f.rows.map((r) => r.neighborhood),
    rows.map((r) => r.neighborhood),
  );
  assert.equal(f.rows.length, 4);
  assert.ok(f.writes.every((w) => !JSON.stringify(w).includes("neighborhood")));
});
test("editing a municipality moves its complete legacy group and rejects existing-city merges and foreign row IDs", async () => {
  const rows = [
      legacy(),
      legacy("ararangua", "Outro bairro"),
      legacy("Sombrio"),
    ],
    f = fixture(rows);
  const result = await f.repo.updateArea(uid, rows[0].id, { city: "Criciúma" });
  assert.equal(result.city, "Criciúma");
  assert.deepEqual(
    f.rows.map((r) => r.city),
    ["Criciúma", "Criciúma", "Sombrio"],
  );
  await assert.rejects(
    f.repo.updateArea(uid, rows[0].id, { city: "sombrio" }),
    (e) => e instanceof ApiError && e.code === "DUPLICATE_RECORD",
  );
  await assert.rejects(
    f.repo.updateArea(uid, randomUUID(), { isActive: false }),
    (e) => e instanceof ApiError && e.getStatus() === 404,
  );
  assert.deepEqual(
    f.rows.map((r) => r.neighborhood),
    rows.map((r) => r.neighborhood),
  );
});
test("legacy physical row counts do not consume the limit of distinct cities", async () => {
  const f = fixture(
    Array.from({ length: 55 }, (_, i) => legacy("Araranguá", `Legado ${i}`)),
  );
  await f.repo.createArea(uid, { city: "Sombrio", state: "SC" });
  assert.equal(f.rows.length, 56);
  assert.equal((await f.repo.own(uid)).areas.length, 2);
});
test("new area contracts and catalog ignore bounded legacy district input without using it as coverage", () => {
  assert.deepEqual(
    areaSchema.parse({ city: "Sombrio", state: "sc", neighborhood: "Centro" }),
    { city: "Sombrio", state: "SC" },
  );
  assert.equal(
    updateAreaSchema.safeParse({ neighborhood: "Centro" }).success,
    false,
  );
  const query = catalogQuerySchema.parse({
    city: "Araranguá",
    state: "SC",
    neighborhood: "Polícia rodoviária",
  });
  assert.ok(!("neighborhood" in query));
});
