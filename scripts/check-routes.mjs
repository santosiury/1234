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
  "client/requests/_layout",
  "client/requests/index",
  "client/requests/[id]",
  "client/profile",
  "provider/_layout",
  "provider/index",
  "provider/requests/_layout",
  "provider/requests/index",
  "provider/requests/[id]",
  "service-request/new",
  "service-request/resume",
  "provider/account",
  "provider/services/_layout",
  "provider/services/index",
  "provider/services/edit",
  "provider/profile/_layout",
  "provider/profile/index",
  "provider/profile/edit",
  "provider/areas/_layout",
  "provider/areas/index",
  "provider/areas/edit",
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
const client = readFileSync(new URL("client/_layout.tsx", root), "utf8");
assert.ok(client.includes("Redirect"), "Client mode guard is missing");
for (const name of ["index", "search", "categories", "requests", "profile"])
  assert.ok(client.includes(`name="${name}"`), `Missing client tab ${name}`);
for (const route of [
  "provider",
  "provider/services",
  "provider/profile",
  "provider/areas",
  "provider/requests",
  "client/requests",
]) {
  const source = readFileSync(new URL(`${route}/_layout.tsx`, root), "utf8");
  assert.ok(source.includes("Stack"), `Missing professional Stack: ${route}`);
  assert.ok(!source.includes("Tabs"), `Unexpected professional tabs: ${route}`);
  assert.match(source, /anchor: "index"/, `Missing return anchor: ${route}`);
}
const provider = readFileSync(new URL("provider/_layout.tsx", root), "utf8");
assert.ok(provider.includes("Redirect"), "Provider mode guard is missing");
console.log(
  `Verified ${routes.length} route files, client tabs and anchored provider stacks. Runtime navigation is covered by mobile tests.`,
);
