import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("quality runs on phase 2.6 pushes and preserves read-only GitHub permissions and all existing checks", async () => {
  const yaml = await readFile("../../.github/workflows/quality.yml", "utf8");
  const push = yaml.slice(
    yaml.indexOf("  push:"),
    yaml.indexOf("permissions:"),
  );
  assert.match(push, /feature\/fase-2-6,/);
  assert.match(yaml, /pull_request:/);
  assert.match(yaml, /permissions:\s*contents: read/);
  assert.doesNotMatch(
    yaml,
    /contents: write|write-all|pull-requests: write|id-token: write/,
  );
  for (const script of [
    "typecheck",
    "lint",
    "test",
    "build:api",
    "check:secrets",
    "check:migrations",
    "check:routes",
    "export:ios",
    "export:android",
  ])
    assert.ok(yaml.includes(script));
});
