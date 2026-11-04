import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { validateEnvironment } from "../src/config";
test("health and OpenAPI work without a database; errors and CORS are controlled", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  try {
    const base = await app.getUrl();
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: "http://localhost:8081" },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:8081",
    );
    const health = await response.json();
    assert.equal(health.status, "ok");
    assert.ok(Date.now() - Date.parse(health.timestamp) < 5000);
    const denied = await fetch(`${base}/api/health`, {
      headers: { Origin: "https://unknown.example" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${base}/docs`)).status, 200);
    const spec = await (await fetch(`${base}/docs-json`)).json();
    assert.ok(spec.paths["/api/health"].get);
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).statusCode, 404);
  } finally {
    await app.close();
  }
});
test("invalid environment is rejected", () => {
  for (const PORT of ["0", "NaN", "65536"])
    assert.throws(() => validateEnvironment({ PORT }));
  assert.throws(() => validateEnvironment({ CORS_ORIGINS: "*" }));
  assert.equal(validateEnvironment({}).PORT, 3000);
});
