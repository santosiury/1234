import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CategorySeedStore,
  initialCategories,
  seedCategories,
} from "../prisma/categories";
test("category seed repeats without duplicates or overwriting manual activation/name changes", async () => {
  const rows = new Map<string, { name: string; isActive: boolean }>();
  const store: CategorySeedStore = {
    serviceCategory: {
      upsert: async ({ where, update, create }) => {
        assert.deepEqual(update, {});
        if (!rows.has(where.slug))
          rows.set(where.slug, { name: create.name, isActive: true });
        return rows.get(where.slug);
      },
    },
  };
  await seedCategories(store);
  assert.equal(rows.size, 8);
  rows.set("eletrica", { name: "Nome editado", isActive: false });
  await seedCategories(store);
  assert.equal(rows.size, initialCategories.length);
  assert.deepEqual(rows.get("eletrica"), {
    name: "Nome editado",
    isActive: false,
  });
});
