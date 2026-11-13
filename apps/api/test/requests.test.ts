import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type {
  AuthTokens,
  CreateRequestInput,
  RequestAction,
  RequestActionInput,
  ServiceRequestDetail,
  RequestPage,
} from "@omini/shared";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuthRepository } from "../src/auth/auth.repository";
import { MarketplaceRepository } from "../src/marketplace/marketplace.repository";
import { RequestsRepository } from "../src/requests/requests.repository";
import { RequestsRateGuard } from "../src/requests/requests-rate.guard";
import { MemoryAuthRepository } from "./support/memory-auth.repository";
import { MemoryMarketplaceRepository } from "./support/memory-marketplace.repository";
import { MemoryRequestsRepository } from "./support/memory-requests.repository";
async function fixture(rate = false) {
  const auth = new MemoryAuthRepository(),
    catalog = new MemoryMarketplaceRepository(auth),
    repo = new MemoryRequestsRepository(auth, catalog);
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(auth)
    .overrideProvider(MarketplaceRepository)
    .useValue(catalog)
    .overrideProvider(RequestsRepository)
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
    );
  if (!rate)
    builder = builder
      .overrideProvider(RequestsRateGuard)
      .useValue({ canActivate: () => true });
  const module = await builder.compile();
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
  let seq = 0;
  async function login(profiles: ("client" | "provider")[] = ["client"]) {
    const email = `request${seq++}@example.test`;
    await call("auth/register", "POST", {
      displayName: "Pessoa Teste",
      email,
      password: "uma senha de teste segura",
      profiles,
    });
    const response = await call("auth/login", "POST", {
      email,
      password: "uma senha de teste segura",
    });
    assert.equal(response.status, 200);
    return (await response.json()) as AuthTokens;
  }
  const provider = await login(["client", "provider"]),
    client = await login(),
    other = await login();
  const workspace = await catalog.own(provider.user.id);
  await catalog.updateProfile(provider.user.id, {
    professionalName: "Elétrica original",
  });
  const service = await catalog.createService(provider.user.id, {
    categoryId: catalog.categoryRows[0].id,
    title: "Instalação de tomadas",
  });
  const area = await catalog.createArea(provider.user.id, {
    city: "Araranguá",
    state: "SC",
    neighborhood: "Centro",
  });
  const input = (
    extra: Partial<CreateRequestInput> = {},
  ): CreateRequestInput => ({
    providerId: workspace.id,
    providerServiceId: service.id,
    description: "Preciso instalar duas tomadas.",
    city: "Araranguá",
    state: "SC",
    neighborhood: "Centro",
    idempotencyKey: randomUUID(),
    ...extra,
  });
  async function create(extra: Partial<CreateRequestInput> = {}) {
    const response = await call("requests", "POST", input(extra), client);
    assert.equal(response.status, 201);
    return (await response.json()) as ServiceRequestDetail;
  }
  async function act(
    row: ServiceRequestDetail,
    action: RequestAction,
    who: AuthTokens = provider,
    extra: Partial<RequestActionInput> = {},
  ) {
    return call(
      `requests/${row.id}/${action}`,
      "POST",
      { version: row.version, idempotencyKey: randomUUID(), ...extra },
      who,
    );
  }
  return {
    app,
    auth,
    catalog,
    repo,
    call,
    login,
    provider,
    client,
    other,
    workspace,
    service,
    area,
    input,
    create,
    act,
  };
}
test("valid request snapshots, coarse location, private projection and deterministic participant lists", async () => {
  const f = await fixture();
  try {
    const row = await f.create();
    assert.equal(row.status, "REQUESTED");
    assert.equal(row.version, 1);
    assert.equal(row.events.length, 1);
    assert.equal(row.events[0].actor, "client");
    assert.equal(row.events[0].occurredAt, row.createdAt);
    for (const secret of [
      "clientUserId",
      "providerUserId",
      "email",
      "password",
      "payloadHash",
      "idempotencyKey",
    ])
      assert.ok(!(secret in row));
    f.workspace.professionalName = "Nome editado";
    f.service.title = "Outro título";
    const detail = (await (
      await f.call(`requests/${row.id}`, "GET", undefined, f.provider)
    ).json()) as ServiceRequestDetail;
    assert.equal(detail.providerNameSnapshot, "Elétrica original");
    assert.equal(detail.serviceTitleSnapshot, "Instalação de tomadas");
    for (const [who, side] of [
      [f.client, "sent"],
      [f.provider, "received"],
    ] as const) {
      const page = (await (
        await f.call(
          `requests/${side}?pageSize=1&status=REQUESTED`,
          "GET",
          undefined,
          who,
        )
      ).json()) as RequestPage;
      assert.equal(page.total, 1);
      assert.equal(page.items[0].id, row.id);
      assert.equal(
        page.items[0].viewer,
        side === "sent" ? "client" : "provider",
      );
    }
    const empty = (await (
      await f.call("requests/sent", "GET", undefined, f.other)
    ).json()) as RequestPage;
    assert.equal(empty.total, 0);
  } finally {
    await f.app.close();
  }
});
test("requests reject anonymous, spoofed actors, self hiring, invalid data and inactive client profiles", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call("requests", "POST", f.input())).status, 401);
    assert.equal((await f.call("requests/sent")).status, 401);
    assert.equal(
      (await f.call("requests", "POST", f.input(), f.provider)).status,
      400,
    );
    for (const extra of [
      { clientUserId: f.other.user.id },
      { providerUserId: f.client.user.id },
      { description: "a" },
      { description: "x".repeat(1001) },
      { description: "Ligue para pessoa@example.test" },
      { description: "Instalação na Rua das Flores, 123" },
      { state: "XX" },
      { idempotencyKey: "invalid" },
    ])
      assert.equal(
        (await f.call("requests", "POST", { ...f.input(), ...extra }, f.client))
          .status,
        400,
      );
    const providerOnly = await f.login(["provider"]);
    assert.equal(
      (await f.call("requests", "POST", f.input(), providerOnly)).status,
      403,
    );
    assert.equal(f.repo.rows.size, 0);
  } finally {
    await f.app.close();
  }
});
test("target validation checks service ownership, category, provider account/profile and the same active coverage area", async () => {
  const f = await fixture();
  try {
    for (const extra of [
      { providerId: randomUUID() },
      { providerServiceId: randomUUID() },
      { city: "Criciúma" },
    ])
      assert.equal(
        (await f.call("requests", "POST", f.input(extra), f.client)).status,
        400,
      );
    for (const field of [
      f.service,
      f.workspace,
      f.area,
      f.catalog.categoryRows[0],
    ]) {
      field.isActive = false;
      assert.equal(
        (await f.call("requests", "POST", f.input(), f.client)).status,
        400,
      );
      field.isActive = true;
    }
    const account = [...f.auth.users.values()].find(
      (x) => x.user.id === f.provider.user.id,
    )!;
    account.active = false;
    assert.equal(
      (await f.call("requests", "POST", f.input(), f.client)).status,
      400,
    );
    account.active = true;
    f.workspace.areas[0].neighborhood = "Centro";
    const valid = await f.create({
      city: "ararangua",
      neighborhood: "Qualquer bairro",
    });
    assert.equal(valid.status, "REQUESTED");
  } finally {
    await f.app.close();
  }
});
test("IDOR prevents third-party detail/actions/history and never reveals another actor's idempotency receipt", async () => {
  const f = await fixture();
  try {
    const input = f.input();
    const row = (await (
      await f.call("requests", "POST", input, f.client)
    ).json()) as ServiceRequestDetail;
    assert.equal(
      (await f.call(`requests/${row.id}`, "GET", undefined, f.other)).status,
      404,
    );
    for (const action of ["accept", "cancel", "confirm-completion"])
      assert.equal(
        (
          await f.call(
            `requests/${row.id}/${action}`,
            "POST",
            { version: 1, idempotencyKey: randomUUID() },
            f.other,
          )
        ).status,
        404,
      );
    assert.equal(
      (
        await f.call(
          `requests/by-key/${input.idempotencyKey}`,
          "GET",
          undefined,
          f.other,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.call(
          `requests/by-key/${input.idempotencyKey}`,
          "GET",
          undefined,
          f.client,
        )
      ).status,
      200,
    );
    assert.equal(f.repo.history.length, 1);
  } finally {
    await f.app.close();
  }
});
test("complete lifecycle requires provider proposal, client confirmation and records reopening reason with server UTC history", async () => {
  const f = await fixture();
  try {
    let row = await f.create();
    assert.equal((await f.act(row, "accept", f.client)).status, 403);
    row = (await (await f.act(row, "accept")).json()) as ServiceRequestDetail;
    assert.equal(row.status, "ACCEPTED");
    row = (await (await f.act(row, "start")).json()) as ServiceRequestDetail;
    assert.equal(row.status, "IN_PROGRESS");
    assert.equal((await f.act(row, "cancel", f.client)).status, 409);
    row = (await (
      await f.act(row, "propose-completion")
    ).json()) as ServiceRequestDetail;
    assert.equal(row.status, "AWAITING_CONFIRMATION");
    assert.equal(
      (await f.act(row, "confirm-completion", f.provider)).status,
      403,
    );
    assert.equal((await f.act(row, "reopen", f.client)).status, 400);
    row = (await (
      await f.act(row, "reopen", f.client, {
        reason: "A segunda tomada ainda não funciona.",
      })
    ).json()) as ServiceRequestDetail;
    assert.equal(row.status, "IN_PROGRESS");
    assert.equal(row.completionProposedAt, null);
    row = (await (
      await f.act(row, "propose-completion")
    ).json()) as ServiceRequestDetail;
    row = (await (
      await f.act(row, "confirm-completion", f.client)
    ).json()) as ServiceRequestDetail;
    assert.equal(row.status, "COMPLETED");
    assert.ok(row.completedAt?.endsWith("Z"));
    assert.equal(row.events.length, 7);
    assert.deepEqual(
      row.events.map((e) => e.version),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.match(row.events[4].reason!, /segunda tomada/);
    for (const action of ["start", "propose-completion", "accept"] as const)
      assert.equal((await f.act(row, action)).status, 409);
    assert.equal((await f.act(row, "cancel", f.client)).status, 409);
    assert.equal(f.repo.history.length, 7);
  } finally {
    await f.app.close();
  }
});
test("rejection and permitted cancellations are final and preserve accepted history", async () => {
  const f = await fixture();
  try {
    const rejected = (await (
      await f.act(await f.create(), "reject", f.provider, {
        reason: "Agenda indisponível.",
      })
    ).json()) as ServiceRequestDetail;
    assert.equal(rejected.status, "REJECTED");
    assert.equal((await f.act(rejected, "accept")).status, 409);
    const cancelled = (await (
      await f.act(await f.create(), "cancel", f.client)
    ).json()) as ServiceRequestDetail;
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelledAt);
    assert.equal(cancelled.acceptedAt, null);
    const accepted = (await (
      await f.act(await f.create(), "accept")
    ).json()) as ServiceRequestDetail;
    const later = (await (
      await f.act(accepted, "cancel", f.client)
    ).json()) as ServiceRequestDetail;
    assert.equal(later.status, "CANCELLED");
    assert.equal(later.acceptedAt, accepted.acceptedAt);
  } finally {
    await f.app.close();
  }
});
test("creation and action idempotency survive retries, reject changed payloads and never duplicate events", async () => {
  const f = await fixture();
  try {
    const input = f.input();
    const responses = await Promise.all([
      f.call("requests", "POST", input, f.client),
      f.call("requests", "POST", input, f.client),
    ]);
    assert.deepEqual(
      responses.map((r) => r.status),
      [201, 201],
    );
    const rows = (await Promise.all(
      responses.map((r) => r.json()),
    )) as ServiceRequestDetail[];
    assert.equal(rows[0].id, rows[1].id);
    assert.equal(f.repo.rows.size, 1);
    assert.equal(f.repo.history.length, 1);
    assert.equal(
      (
        await f.call(
          "requests",
          "POST",
          { ...input, description: "Outro trabalho bem diferente." },
          f.client,
        )
      ).status,
      409,
    );
    const key = randomUUID(),
      body = { version: 1, idempotencyKey: key };
    const first = await f.call(
      `requests/${rows[0].id}/accept`,
      "POST",
      body,
      f.provider,
    );
    assert.equal(first.status, 200);
    const again = await f.call(
      `requests/${rows[0].id}/accept`,
      "POST",
      body,
      f.provider,
    );
    assert.equal(again.status, 200);
    assert.equal(f.repo.history.length, 2);
    assert.equal(
      (
        await f.call(
          `requests/${rows[0].id}/accept`,
          "POST",
          { ...body, reason: "Alterei a intenção." },
          f.provider,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await f.act(rows[0], "cancel", f.client, {
          idempotencyKey: input.idempotencyKey,
        })
      ).status,
      409,
    );
  } finally {
    await f.app.close();
  }
});
test("competing transitions produce a single winner and a failed audit insert rolls back the status", async () => {
  const f = await fixture();
  try {
    const row = await f.create();
    const race = await Promise.all([
      f.act(row, "accept"),
      f.act(row, "reject"),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    assert.equal(f.repo.history.length, 2);
    const fresh = await f.create();
    f.repo.failAppend = true;
    const failed = await f.act(fresh, "accept");
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private SQL"));
    assert.equal(f.repo.rows.get(fresh.id)?.status, "REQUESTED");
    assert.equal(
      f.repo.history.filter((e) => e.requestId === fresh.id).length,
      1,
    );
  } finally {
    await f.app.close();
  }
});
test("request pagination, status filters, errors, session revocation and Swagger remain safe", async () => {
  const f = await fixture();
  try {
    const a = await f.create();
    await f.create();
    await f.create();
    await f.act(a, "reject");
    const page = (await (
      await f.call(
        "requests/sent?page=1&pageSize=1&status=REQUESTED",
        "GET",
        undefined,
        f.client,
      )
    ).json()) as RequestPage;
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    const next = (await (
      await f.call(
        "requests/sent?page=2&pageSize=1&status=REQUESTED",
        "GET",
        undefined,
        f.client,
      )
    ).json()) as RequestPage;
    assert.notEqual(page.items[0].id, next.items[0].id);
    for (const q of [
      "page=0",
      "pageSize=21",
      "status=BOGUS",
      "clientUserId=other",
    ])
      assert.equal(
        (await f.call(`requests/sent?${q}`, "GET", undefined, f.client)).status,
        400,
      );
    f.repo.failRead = true;
    const failed = await f.call(`requests/${a.id}`, "GET", undefined, f.client);
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private SQL"));
    f.repo.failRead = false;
    const docs = (await (await f.call("../docs-json")).json()) as {
      paths: Record<string, unknown>;
    };
    assert.ok(docs.paths["/api/requests/{id}/{action}"]);
    await f.call("auth/logout", "POST", {
      refreshToken: f.client.refreshToken,
    });
    assert.equal(
      (await f.call("requests/sent", "GET", undefined, f.client)).status,
      401,
    );
    assert.equal((await f.call("health")).status, 200);
  } finally {
    await f.app.close();
  }
});
test("request write limits are enforced before persistence", async () => {
  const f = await fixture(true);
  try {
    let limited: Response | undefined;
    for (let n = 0; n < 32; n++) {
      limited = await f.call("requests", "POST", f.input(), f.client);
      if (limited.status === 429) break;
    }
    assert.equal(limited?.status, 429);
    assert.ok(f.repo.rows.size <= 30);
    assert.equal(limited!.headers.get("retry-after"), "60");
  } finally {
    await f.app.close();
  }
});

test("long immutable history is bounded, ordered and participant-only across version cursors", async () => {
  const f = await fixture();
  try {
    let row = await f.create();
    row = (await (await f.act(row, "accept")).json()) as ServiceRequestDetail;
    row = (await (await f.act(row, "start")).json()) as ServiceRequestDetail;
    for (let i = 0; i < 12; i++) {
      row = (await (
        await f.act(row, "propose-completion")
      ).json()) as ServiceRequestDetail;
      row = (await (
        await f.act(row, "reopen", f.client, {
          reason: "Ainda falta finalizar uma parte.",
        })
      ).json()) as ServiceRequestDetail;
    }
    assert.equal(row.version, 27);
    assert.equal(row.eventTotal, 27);
    assert.equal(row.events.length, 20);
    const page = await (
      await f.call(
        `requests/${row.id}/history?afterVersion=20`,
        "GET",
        undefined,
        f.client,
      )
    ).json();
    assert.deepEqual(
      page.items.map((e: { version: number }) => e.version),
      [21, 22, 23, 24, 25, 26, 27],
    );
    assert.equal(page.total, 27);
    assert.equal(page.nextVersion, null);
    assert.equal(
      (await f.call(`requests/${row.id}/history`, "GET", undefined, f.other))
        .status,
      404,
    );
    assert.equal(
      (
        await f.call(
          `requests/${row.id}/history?afterVersion=-1`,
          "GET",
          undefined,
          f.client,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call(
          `requests/${row.id}/history?afterVersion=0&actor=other`,
          "GET",
          undefined,
          f.provider,
        )
      ).status,
      400,
    );
  } finally {
    await f.app.close();
  }
});

test("a legacy Centro service area covers every district of the same city, without collecting district for new requests", async () => {
  const f = await fixture();
  try {
    f.workspace.areas[0].neighborhood = "Centro";
    f.workspace.areas.push({
      ...f.workspace.areas[0],
      id: randomUUID(),
      neighborhood: "Polícia rodoviária",
      isActive: false,
    });
    const row = await f.create({ neighborhood: undefined, city: "ARARANGUA" });
    assert.equal(row.status, "REQUESTED");
    assert.equal(row.neighborhood, "");
    assert.equal(f.repo.rows.get(row.id)?.neighborhood, "");
    const legacyCaller = await f.create({ neighborhood: "Polícia rodoviária" });
    assert.equal(legacyCaller.neighborhood, "");
    assert.equal(
      (
        await f.call(
          "requests",
          "POST",
          f.input({ city: "Sombrio", neighborhood: undefined }),
          f.client,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call(
          "requests",
          "POST",
          f.input({ state: "RS", neighborhood: undefined }),
          f.client,
        )
      ).status,
      400,
    );
  } finally {
    await f.app.close();
  }
});
test("legacy receipts and request snapshots retain district and payload hash across recovery without duplicate creation", async () => {
  const f = await fixture();
  try {
    const input = f.input({ neighborhood: "Centro" });
    const original = (await (
      await f.call("requests", "POST", input, f.client)
    ).json()) as ServiceRequestDetail;
    // Simulate the stored snapshot from the previous deployed version; preserve its original receipt.
    f.repo.rows.get(original.id)!.neighborhood = "Centro";
    const { idempotencyKey: _key, ...legacyContent } = input;
    // Receipt algorithm and normalized property order from 74d4a6e, not a re-hash migration.
    const hash = createHash("sha256")
      .update(JSON.stringify({ action: "create", ...legacyContent }))
      .digest("hex");
    assert.equal(_key, input.idempotencyKey);
    f.repo.history[0].payloadHash = hash;
    const replay = await f.call("requests", "POST", input, f.client);
    assert.equal(replay.status, 201);
    const recovered = await replay.json();
    assert.equal(recovered.id, original.id);
    assert.equal(recovered.neighborhood, "Centro");
    assert.equal(f.repo.history[0].payloadHash, hash);
    assert.equal(f.repo.history.length, 1);
    assert.equal(f.repo.rows.size, 1);
    const byKey = await f.call(
      `requests/by-key/${input.idempotencyKey}`,
      "GET",
      undefined,
      f.client,
    );
    assert.equal((await byKey.json()).id, original.id);
    assert.equal(
      (
        await f.call(
          "requests",
          "POST",
          { ...input, neighborhood: "" },
          f.client,
        )
      ).status,
      409,
    );
  } finally {
    await f.app.close();
  }
});
