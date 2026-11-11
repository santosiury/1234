import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const root = new URL("../apps/mobile/app/", import.meta.url);
const routes = [
  "login",
  "register",
  "account",
  "index",
  "_layout",
  "client/_layout",
  "client/index",
  "client/search",
  "client/categories",
  "client/requests",
  "client/profile",
  "provider/_layout",
  "provider/index",
  "provider/requests",
  "provider/services",
  "provider/profile",
  "professional/[id]",
  "provider-setup/_layout",
  "provider-setup/service",
  "provider-setup/profile",
  "provider-setup/areas",
  "provider-setup/area",
  "+not-found",
];
for (const route of routes)
  assert.ok(
    existsSync(new URL(`${route}.tsx`, root)),
    `Missing route: ${route}`,
  );
for (const mode of ["client", "provider"]) {
  const source = readFileSync(new URL(`${mode}/_layout.tsx`, root), "utf8");
  assert.ok(source.includes("Redirect"), "Mode guard is missing");
  for (const name of mode === "client"
    ? ["index", "search", "categories", "requests", "profile"]
    : ["index", "requests", "services", "profile"])
    assert.ok(source.includes(`name="${name}"`), `Missing tab ${mode}/${name}`);
}
console.log(
  `Verified ${routes.length} route files and both tab layouts. Runtime navigation is covered by mobile tests.`,
);
