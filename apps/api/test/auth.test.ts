import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthTokens } from "@omini/shared";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuthRepository } from "../src/auth/auth.repository";
import { tokenHash } from "../src/auth/auth.service";
import { MemoryAuthRepository } from "./support/memory-auth.repository";
import { validateEnvironment } from "../src/config";
const input = {
  displayName: "Pessoa Teste",
  email: "pessoa@example.test",
  password: "uma senha de teste segura",
  profiles: ["client", "provider"],
};
async function fixture() {
  const repository = new MemoryAuthRepository();
  const secret = randomBytes(64).toString("base64");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(repository)
    .overrideProvider(ConfigService)
    .useValue(
      new ConfigService({
        AUTH_ENABLED: true,
        PERSISTENCE_ENABLED: false,
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: secret,
        CORS_ORIGINS: [],
      }),
    )
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const call = (path: string, body?: unknown, access?: string) =>
    fetch(base + "/api/auth/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: "Bearer " + access } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function login() {
    assert.equal((await call("register", input)).status, 202);
    const response = await call("login", {
      email: input.email,
      password: input.password,
    });
    assert.equal(response.status, 200);
    return (await response.json()) as AuthTokens;
  }
  return { app, call, login, repository, secret, jwt: module.get(JwtService) };
}
test("valid registration, generic duplicate response, Argon2id and canonical login", async () => {
  const f = await fixture();
  try {
    const first = await f.call("register", input);
    const duplicate = await f.call("register", {
      ...input,
      password: "outra senha bem diferente",
    });
    assert.equal(first.status, 202);
    assert.equal(duplicate.status, 202);
    assert.deepEqual(await first.json(), await duplicate.json());
    assert.equal(f.repository.users.size, 1);
    const hash = f.repository.users.get(input.email)!.passwordHash;
    assert.match(hash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    assert.ok(!hash.includes(input.password));
    const login = await f.call("login", {
      email: " PESSOA@example.test ",
      password: input.password,
    });
    assert.equal(login.status, 200);
    const tokens = (await login.json()) as AuthTokens;
    assert.deepEqual(tokens.user.profiles, { client: true, provider: true });
    assert.equal(login.headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(tokens).includes("passwordHash"));
    assert.ok(
      [...f.repository.refreshTokens.keys()].every(
        (key) => /^[a-f0-9]{64}$/.test(key) && key !== tokens.refreshToken,
      ),
    );
  } finally {
    await f.app.close();
  }
});
test("invalid registration is rejected without persistence; password is never echoed", async () => {
  const f = await fixture();
  try {
    let index = 0;
    for (const patch of [
      { password: "short" },
      { password: " ".repeat(20) },
      { password: "x".repeat(129) },
      { email: "invalid" },
      { displayName: " " },
      { profiles: [] },
      { profiles: ["admin"] },
      { userId: "forged" },
    ]) {
      const response = await f.call("register", {
        ...input,
        email: `invalid-case-${index++}@example.test`,
        ...patch,
      });
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.ok(!text.includes(input.password));
      assert.match(text, /VALIDATION_ERROR/);
    }
    assert.equal(f.repository.users.size, 0);
  } finally {
    await f.app.close();
  }
});
test("incorrect login and unknown email are indistinguishable; me requires valid JWT", async () => {
  const f = await fixture();
  try {
    const tokens = await f.login();
    const wrong = await f.call("login", {
      email: input.email,
      password: "senha errada",
    });
    const unknown = await f.call("login", {
      email: "unknown@example.test",
      password: "senha errada",
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal((await wrong.json()).code, (await unknown.json()).code);
    assert.equal((await f.call("me")).status, 401);
    assert.equal(
      (await f.call("me", undefined, "invalid.jwt.signature")).status,
      401,
    );
    const me = await f.call("me", undefined, tokens.accessToken);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).id, tokens.user.id);
    const sid = [...f.repository.sessions.keys()][0];
    for (const options of [
      { expiresIn: -10, issuer: "omini-api", audience: "omini-mobile" },
      { expiresIn: 10, issuer: "other", audience: "omini-mobile" },
    ]) {
      const expired = await f.jwt.signAsync(
        { sub: tokens.user.id, sid },
        { secret: f.secret, algorithm: "HS256", ...options },
      );
      assert.equal((await f.call("me", undefined, expired)).status, 401);
    }
  } finally {
    await f.app.close();
  }
});
test("refresh rotation detects reuse and revokes the complete session family", async () => {
  const f = await fixture();
  try {
    const first = await f.login();
    const response = await f.call("refresh", {
      refreshToken: first.refreshToken,
    });
    assert.equal(response.status, 200);
    const second = (await response.json()) as AuthTokens;
    assert.notEqual(first.refreshToken, second.refreshToken);
    assert.equal(
      f.repository.refreshTokens.get(tokenHash(first.refreshToken))!.consumed,
      true,
    );
    assert.equal(
      (await f.call("me", undefined, second.accessToken)).status,
      200,
    );
    assert.equal(
      (await f.call("refresh", { refreshToken: first.refreshToken })).status,
      401,
    );
    assert.equal(
      (await f.call("refresh", { refreshToken: second.refreshToken })).status,
      401,
    );
    assert.equal(
      (await f.call("me", undefined, second.accessToken)).status,
      401,
    );
  } finally {
    await f.app.close();
  }
});
test("logout is idempotent, revokes access immediately and does not revoke another login", async () => {
  const f = await fixture();
  try {
    const first = await f.login();
    const second = (await (
      await f.call("login", { email: input.email, password: input.password })
    ).json()) as AuthTokens;
    assert.equal(
      (await f.call("logout", { refreshToken: first.refreshToken })).status,
      204,
    );
    assert.equal(
      (await f.call("logout", { refreshToken: first.refreshToken })).status,
      204,
    );
    assert.equal(
      (
        await f.call("logout", {
          refreshToken: randomBytes(32).toString("base64url"),
        })
      ).status,
      204,
    );
    assert.equal(
      (await f.call("me", undefined, first.accessToken)).status,
      401,
    );
    assert.equal(
      (await f.call("refresh", { refreshToken: first.refreshToken })).status,
      401,
    );
    assert.equal(
      (await f.call("me", undefined, second.accessToken)).status,
      200,
    );
  } finally {
    await f.app.close();
  }
});
test("expired or disabled sessions cannot refresh", async () => {
  const f = await fixture();
  try {
    const tokens = await f.login();
    f.repository.sessions.values().next().value!.expiresAt = new Date(0);
    assert.equal(
      (await f.call("refresh", { refreshToken: tokens.refreshToken })).status,
      401,
    );
    const other = (await (
      await f.call("login", { email: input.email, password: input.password })
    ).json()) as AuthTokens;
    f.repository.users.get(input.email)!.active = false;
    assert.equal(
      (await f.call("me", undefined, other.accessToken)).status,
      401,
    );
    assert.equal(
      (await f.call("refresh", { refreshToken: other.refreshToken })).status,
      401,
    );
  } finally {
    await f.app.close();
  }
});
test("profile enrollment uses the same account and guards reject identity spoofing", async () => {
  const f = await fixture();
  try {
    await f.call("register", { ...input, profiles: ["client"] });
    const tokens = (await (
      await f.call("login", { email: input.email, password: input.password })
    ).json()) as AuthTokens;
    assert.deepEqual(tokens.user.profiles, { client: true, provider: false });
    assert.equal((await f.call("profiles", { role: "provider" })).status, 401);
    assert.equal(
      (
        await f.call(
          "profiles",
          { role: "provider", userId: "other" },
          tokens.accessToken,
        )
      ).status,
      400,
    );
    const response = await f.call(
      "profiles",
      { role: "provider" },
      tokens.accessToken,
    );
    assert.equal(response.status, 200);
    const user = await response.json();
    assert.equal(user.id, tokens.user.id);
    assert.deepEqual(user.profiles, { client: true, provider: true });
    assert.equal(f.repository.users.size, 1);
    f.repository.blocked.add("provider");
    assert.equal(
      (await f.call("profiles", { role: "provider" }, tokens.accessToken))
        .status,
      403,
    );
  } finally {
    await f.app.close();
  }
});
test("login rate limit rejects excessive attempts before further password work", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await f.call("login", {
            email: "nobody@example.test",
            password: "incorrect",
          })
        ).status,
        401,
      );
    const limited = await f.call("login", {
      email: "nobody@example.test",
      password: "incorrect",
    });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal((await limited.json()).code, "TOO_MANY_ATTEMPTS");
  } finally {
    await f.app.close();
  }
});
test("authentication cannot be enabled with missing persistence or a weak JWT key", () => {
  assert.throws(() => validateEnvironment({ AUTH_ENABLED: "true" }));
  assert.throws(() =>
    validateEnvironment({
      AUTH_ENABLED: "true",
      PERSISTENCE_ENABLED: "true",
      DATABASE_URL: "sqlserver://placeholder",
      JWT_ACCESS_SECRET: "short",
    }),
  );
});

test("malformed JSON never echoes passwords through parser errors", async () => {
  const f = await fixture();
  try {
    const response = await fetch((await f.app.getUrl()) + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email":"x@example.test","password":"private-marker-should-not-echo"',
    });
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.ok(!body.includes("private-marker"));
    assert.ok(!body.includes("SyntaxError"));
  } finally {
    await f.app.close();
  }
});

test("simultaneous refresh use cannot leave two active successors", async () => {
  const f = await fixture();
  try {
    const tokens = await f.login();
    const results = await Promise.all([
      f.call("refresh", { refreshToken: tokens.refreshToken }),
      f.call("refresh", { refreshToken: tokens.refreshToken }),
    ]);
    assert.deepEqual(
      results.map((response) => response.status).sort(),
      [200, 401],
    );
    assert.equal(
      (await f.call("me", undefined, tokens.accessToken)).status,
      401,
    );
  } finally {
    await f.app.close();
  }
});
