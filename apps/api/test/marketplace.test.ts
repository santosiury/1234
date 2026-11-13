import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type {
  AuthTokens,
  ProviderAreaRecord,
  ProviderServiceRecord,
  ProviderWorkspace,
  PublicProvider,
} from "@omini/shared";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuthRepository } from "../src/auth/auth.repository";
import { MarketplaceRepository } from "../src/marketplace/marketplace.repository";
import { MemoryAuthRepository } from "./support/memory-auth.repository";
import { MemoryMarketplaceRepository } from "./support/memory-marketplace.repository";
async function fixture() {
  const auth = new MemoryAuthRepository();
  const repo = new MemoryMarketplaceRepository(auth);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(auth)
    .overrideProvider(MarketplaceRepository)
    .useValue(repo)
    .overrideProvider(ConfigService)
    .useValue(
      new ConfigService({
        AUTH_ENABLED: true,
        PERSISTENCE_ENABLED: false,
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: randomBytes(64).toString("base64"),
        CORS_ORIGINS: [],
      }),
    )
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    tokens?: AuthTokens,
  ) =>
    fetch(base + "/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let next = 0;
  async function login(provider = false) {
    const email = `person${next++}@example.test`;
    await call("auth/register", "POST", {
      displayName: "Pessoa Teste",
      email,
      password: "uma senha de teste segura",
      profiles: provider ? ["client", "provider"] : ["client"],
    });
    const response = await call("auth/login", "POST", {
      email,
      password: "uma senha de teste segura",
    });
    assert.equal(response.status, 200);
    return (await response.json()) as AuthTokens;
  }
  async function complete(name = "Álvaro Elétrica") {
    const tokens = await login(true);
    await call(
      "provider/me",
      "PATCH",
      { professionalName: name, bio: "Reparos residenciais." },
      tokens,
    );
    const service = (await (
      await call(
        "provider/me/services",
        "POST",
        {
          categoryId: repo.categoryRows[0].id,
          title: "Reparo elétrico",
          description: "Instalações residenciais.",
        },
        tokens,
      )
    ).json()) as ProviderServiceRecord;
    const area = (await (
      await call(
        "provider/me/areas",
        "POST",
        { city: "Araranguá", state: "sc", neighborhood: "Centro" },
        tokens,
      )
    ).json()) as ProviderAreaRecord;
    const profile = (await (
      await call("provider/me", "GET", undefined, tokens)
    ).json()) as ProviderWorkspace;
    return { tokens, service, area, profile };
  }
  return { app, auth, repo, call, login, complete };
}
test("account enrollment creates the professional profile without duplicating the user, then persists editable public data", async () => {
  const f = await fixture();
  try {
    const tokens = await f.login();
    assert.equal(
      (await f.call("provider/me", "GET", undefined, tokens)).status,
      403,
    );
    const enrolled = await f.call(
      "auth/profiles",
      "POST",
      { role: "provider" },
      tokens,
    );
    assert.equal(enrolled.status, 200);
    assert.equal((await enrolled.json()).id, tokens.user.id);
    assert.equal(f.auth.users.size, 1);
    const profile = await f.call("provider/me", "GET", undefined, tokens);
    assert.equal(profile.status, 200);
    assert.equal(
      (
        await f.call(
          "provider/me",
          "PATCH",
          {
            professionalName: "Técnica Araranguá",
            bio: "Descrição profissional.",
          },
          tokens,
        )
      ).status,
      200,
    );
    const saved = await (
      await f.call("provider/me", "GET", undefined, tokens)
    ).json();
    assert.equal(saved.professionalName, "Técnica Araranguá");
    assert.equal(saved.bio, "Descrição profissional.");
  } finally {
    await f.app.close();
  }
});
test("service creation, editing, deactivation and reactivation control the public catalog", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    const publicPath = `catalog/providers/${item.profile.id}`;
    assert.equal((await f.call(publicPath)).status, 200);
    assert.equal(
      (
        await f.call(
          `provider/me/services/${item.service.id}`,
          "PATCH",
          { title: "Instalações e reparos" },
          item.tokens,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await f.call(publicPath)).json()).services[0].title,
      "Instalações e reparos",
    );
    assert.equal(
      (
        await f.call(
          `provider/me/services/${item.service.id}`,
          "PATCH",
          { isActive: false },
          item.tokens,
        )
      ).status,
      200,
    );
    assert.equal((await f.call(publicPath)).status, 404);
    assert.equal(
      (
        await f.call(
          `provider/me/services/${item.service.id}`,
          "PATCH",
          { isActive: true },
          item.tokens,
        )
      ).status,
      200,
    );
    assert.equal((await f.call(publicPath)).status, 200);
  } finally {
    await f.app.close();
  }
});
test("areas can be edited and deactivated; an inactive area cannot keep a professional visible", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    assert.equal(
      (
        await f.call(
          `provider/me/areas/${item.area.id}`,
          "PATCH",
          { city: "Sombrio" },
          item.tokens,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.call("provider/me/areas", "GET", undefined, item.tokens)
        ).json()
      )[0].city,
      "Sombrio",
    );
    assert.equal(
      (
        await f.call(
          `provider/me/areas/${item.area.id}`,
          "PATCH",
          { isActive: false },
          item.tokens,
        )
      ).status,
      200,
    );
    assert.equal((await (await f.call("catalog/providers")).json()).total, 0);
    assert.equal(
      (
        await (
          await f.call("provider/me/areas", "GET", undefined, item.tokens)
        ).json()
      ).length,
      1,
    );
  } finally {
    await f.app.close();
  }
});
test("private endpoints reject anonymous requests, identity spoofing and edits of another account's services/areas", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    const other = await f.login(true);
    for (const [path, method, body] of [
      ["provider/me", "GET", undefined],
      ["provider/me", "PATCH", { professionalName: "Other" }],
      ["provider/me/services", "POST", {}],
      ["provider/me/areas", "POST", {}],
    ] as const)
      assert.equal((await f.call(path, method, body)).status, 401);
    assert.equal(
      (
        await f.call(
          `provider/me/services/${item.service.id}`,
          "PATCH",
          { isActive: false },
          other,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.call(
          `provider/me/areas/${item.area.id}`,
          "PATCH",
          { isActive: false },
          other,
        )
      ).status,
      404,
    );
    for (const body of [
      { userId: item.tokens.user.id, professionalName: "Fraud" },
      { providerId: item.profile.id, professionalName: "Fraud" },
    ])
      assert.equal(
        (await f.call("provider/me", "PATCH", body, other)).status,
        400,
      );
    assert.equal(
      f.repo.profiles.get(item.tokens.user.id)!.services[0].isActive,
      true,
    );
    assert.equal(
      f.repo.profiles.get(item.tokens.user.id)!.areas[0].isActive,
      true,
    );
  } finally {
    await f.app.close();
  }
});
test("public search combines category, accent/case insensitive name and the same active area; records are never duplicated", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    const cat = f.repo.categoryRows[0].id;
    await f.call(
      "provider/me/areas",
      "POST",
      { city: "Araranguá", state: "SC", neighborhood: "Centro" },
      item.tokens,
    );
    const response = await f.call(
      `catalog/providers?q=ALVARO&categoryId=${cat}&city=ararangua&state=sc&neighborhood=centro`,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.equal(
      (await (await f.call("catalog/providers?q=ELETRICISTA")).json()).total,
      1,
    );
    assert.equal(
      (
        await (
          await f.call(
            `catalog/providers?categoryId=${f.repo.categoryRows[1].id}`,
          )
        ).json()
      ).total,
      0,
    );
    await f.call(
      "provider/me/areas",
      "POST",
      { city: "Criciúma", state: "SC", neighborhood: "Próspera" },
      item.tokens,
    );
    assert.equal(
      (
        await (
          await f.call(
            "catalog/providers?city=Ararangu%C3%A1&neighborhood=Prospera",
          )
        ).json()
      ).total,
      1,
    );
    await f.call(
      "provider/me/areas",
      "POST",
      { city: "Araranguá", state: "SC", neighborhood: "" },
      item.tokens,
    );
    assert.equal(
      (
        await (
          await f.call("catalog/providers?city=ararangua&neighborhood=Qualquer")
        ).json()
      ).total,
      1,
    );
  } finally {
    await f.app.close();
  }
});
test("inactive accounts, profiles, services and categories are excluded and public payloads contain no private identifiers", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    const path = `catalog/providers/${item.profile.id}`;
    const data = await (await f.call(path)).json();
    assert.deepEqual(Object.keys(data).sort(), [
      "areas",
      "bio",
      "id",
      "professionalName",
      "services",
    ]);
    for (const key of [
      "email",
      "phone",
      "userId",
      "password",
      "tokenHash",
      "refreshToken",
      "authCredential",
    ])
      assert.ok(!JSON.stringify(data).includes(key));
    const profile = f.repo.profiles.get(item.tokens.user.id)!;
    profile.isActive = false;
    assert.equal((await f.call(path)).status, 404);
    profile.isActive = true;
    f.repo.categoryRows[0].isActive = false;
    assert.equal((await f.call(path)).status, 404);
    assert.equal((await (await f.call("catalog/categories")).json()).length, 1);
    f.repo.categoryRows[0].isActive = true;
    f.auth.users.get(item.tokens.user.email)!.active = false;
    assert.equal((await f.call(path)).status, 404);
  } finally {
    await f.app.close();
  }
});
test("pagination is bounded and deterministic, invalid input is rejected and duplicates do not overwrite records", async () => {
  const f = await fixture();
  try {
    const first = await f.complete("Beta");
    await f.complete("Álvaro");
    await f.complete("Celia");
    const one = await (
      await f.call("catalog/providers?page=1&pageSize=2")
    ).json();
    const two = await (
      await f.call("catalog/providers?page=2&pageSize=2")
    ).json();
    assert.equal(one.total, 3);
    assert.equal(one.items.length, 2);
    assert.equal(two.items.length, 1);
    assert.deepEqual(
      one.items.map((p: PublicProvider) => p.professionalName),
      ["Álvaro", "Beta"],
    );
    assert.notEqual(one.items[1].id, two.items[0].id);
    for (const query of [
      "page=0",
      "pageSize=21",
      "page=1001",
      "pageSize[]=2",
      "state=XX",
      "categoryId=invalid",
      "q=" + "x".repeat(81),
      "ownerId=ignored",
    ])
      assert.equal((await f.call("catalog/providers?" + query)).status, 400);
    for (const body of [
      { professionalName: " " },
      { bio: "x".repeat(1001) },
      { isActive: false },
      {},
    ])
      assert.equal(
        (await f.call("provider/me", "PATCH", body, first.tokens)).status,
        400,
      );
    for (const body of [
      { city: "A", state: "SC" },
      { city: "Araranguá", state: "ZZ" },
      { city: "Araranguá", state: "SC", providerId: randomUUID() },
    ])
      assert.equal(
        (await f.call("provider/me/areas", "POST", body, first.tokens)).status,
        400,
      );
    assert.equal(
      (
        await f.call(
          "provider/me/services",
          "POST",
          { categoryId: f.repo.categoryRows[0].id, title: "Reparo elétrico" },
          first.tokens,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await f.call(
          "provider/me/services",
          "POST",
          { categoryId: randomUUID(), title: "Outro serviço" },
          first.tokens,
        )
      ).status,
      400,
    );
  } finally {
    await f.app.close();
  }
});
test("catalog failures are sanitized, logout revokes editing and OpenAPI documents the new routes", async () => {
  const f = await fixture();
  try {
    const item = await f.complete();
    await f.call("auth/logout", "POST", {
      refreshToken: item.tokens.refreshToken,
    });
    assert.equal(
      (await f.call("provider/me", "GET", undefined, item.tokens)).status,
      401,
    );
    f.repo.categories = async () => {
      throw Error("SQL password sensitive-marker");
    };
    const failure = await f.call("catalog/categories");
    assert.equal(failure.status, 503);
    const text = await failure.text();
    assert.ok(!text.includes("sensitive-marker"));
    assert.ok(!text.includes("password"));
    const spec = await (
      await fetch((await f.app.getUrl()) + "/docs-json")
    ).json();
    assert.ok(spec.paths["/api/catalog/providers"].get);
    assert.ok(spec.paths["/api/provider/me/services/{id}"].patch.security);
    assert.equal((await f.call("health")).status, 200);
  } finally {
    await f.app.close();
  }
});

test("catalog rate limiting bounds repeated public requests without requiring authentication", async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 120; index++)
      assert.equal((await f.call("catalog/categories")).status, 200);
    const limited = await f.call("catalog/categories");
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "TOO_MANY_ATTEMPTS");
    assert.equal(limited.headers.get("retry-after"), "60");
  } finally {
    await f.app.close();
  }
});

test("public and own catalogs collapse legacy districts with any-active semantics, and toggles cover the full municipality", async () => {
  const f = await fixture();
  try {
    const item = await f.complete(),
      raw = f.repo.profiles.get(item.tokens.user.id)!;
    raw.areas[0].neighborhood = "Centro";
    raw.areas[0].isActive = false;
    raw.areas.push({
      ...raw.areas[0],
      id: randomUUID(),
      neighborhood: "Polícia rodoviária",
      isActive: true,
    });
    const own = await (
      await f.call("provider/me", "GET", undefined, item.tokens)
    ).json();
    assert.equal(own.areas.length, 1);
    assert.equal(own.areas[0].isActive, true);
    assert.ok(!("neighborhood" in own.areas[0]));
    const catalog = await (
      await f.call(
        "catalog/providers?city=ararangua&state=sc&neighborhood=Qualquer",
      )
    ).json();
    assert.equal(catalog.total, 1);
    assert.equal(catalog.items.length, 1);
    assert.equal(catalog.items[0].areas.length, 1);
    assert.ok(!("neighborhood" in catalog.items[0].areas[0]));
    assert.equal(
      (
        await f.call(
          "provider/me/areas",
          "POST",
          { city: "ARARANGUA", state: "SC" },
          item.tokens,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await f.call(
          "provider/me/areas",
          "POST",
          { city: "Criciúma", state: "SC" },
          item.tokens,
        )
      ).status,
      201,
    );
    const path = `provider/me/areas/${own.areas[0].id}`;
    assert.equal(
      (await f.call(path, "PATCH", { isActive: false }, item.tokens)).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.call("catalog/providers?city=Ararangu%C3%A1&state=SC")
        ).json()
      ).total,
      0,
    );
    assert.equal(
      (
        await (
          await f.call("catalog/providers?city=Crici%C3%BAma&state=SC")
        ).json()
      ).total,
      1,
    );
    assert.equal(
      (await f.call(path, "PATCH", { isActive: true }, item.tokens)).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.call("catalog/providers?city=Ararangu%C3%A1&state=SC")
        ).json()
      ).total,
      1,
    );
    assert.equal(raw.areas.length, 3);
    assert.equal(raw.areas[0].neighborhood, "Centro");
    assert.equal(raw.areas[1].neighborhood, "Polícia rodoviária");
  } finally {
    await f.app.close();
  }
});
