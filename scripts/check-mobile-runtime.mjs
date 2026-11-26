// Offline source/route verification. Does not read .env, contact an API or run SQL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const files = [
  "apps/mobile/src/components/ReviewsSection.tsx",
  "apps/mobile/src/reviews/RequestReviewPanel.tsx",
  "apps/mobile/src/reviews/ReviewScreen.tsx",
  "apps/mobile/src/reviews/ProviderReviews.tsx",
  "apps/mobile/src/requests/screens.tsx",
  "apps/mobile/src/requests/CancellationDialog.tsx",
  "apps/mobile/src/requests/api.ts",
  "apps/mobile/src/dev/runtime.ts",
  "apps/mobile/src/components/Profile.tsx",
  "apps/mobile/src/dev/DiagnosticsScreen.tsx",
  "apps/mobile/src/components/ReputationSummary.tsx",
  "apps/mobile/src/reviews/ClientReputation.tsx",
  "apps/mobile/src/reviews/api.ts",
];
const source = (path) => readFileSync(new URL(path, root), "utf8");
try {
  for (const path of [
    "apps/mobile/app/client/requests/[id].tsx",
    "apps/mobile/app/provider/requests/[id].tsx",
  ])
    assert.match(source(path), /RequestDetailScreen/);
  assert.match(
    source("apps/mobile/app/professional/[id].tsx"),
    /CatalogDetail/,
  );
  assert.match(
    source("apps/mobile/app/provider/profile/index.tsx"),
    /ProviderProfileOverview/,
  );
  for (const path of [
    "apps/mobile/src/marketplace/CatalogScreens.tsx",
    "apps/mobile/src/marketplace/ProviderScreens.tsx",
  ])
    assert.match(source(path), /<ProviderReviews\b/);
  assert.match(
    source("apps/mobile/src/reviews/ProviderReviews.tsx"),
    /<ReviewsSection\b/,
  );
  assert.match(source(files[4]), /<CancellationDialog\b/);
  assert.match(source(files[5]), /api\.cancel\(request\.id, intent\.current\)/);
  for (const path of files.slice(0, 3)) {
    assert.ok(
      source(path).includes("⭐") || source(path).includes("ReputationSummary"),
    );
    assert.doesNotMatch(source(path), /\bde 5\b/);
  }
  assert.doesNotMatch(
    source(files[4]),
    /cancelamento após o início não está disponível|pending\.action === "cancel"/,
  );
  const revision = source(files[7]).match(
    /MOBILE_UI_REVISION = "([a-zA-Z0-9.-]+)"/,
  )?.[1];
  assert.ok(revision);
  assert.doesNotMatch(
    source(files[8]),
    /MOBILE_UI_REVISION|Conexão com a API|Testar conexão|EXPO_PUBLIC_API_URL/,
  );
  assert.match(source(files[9]), /MOBILE_UI_REVISION/);
  assert.match(
    source("apps/mobile/app/internal/diagnostics.tsx"),
    /DiagnosticsScreen/,
  );
  const fingerprint = createHash("sha256");
  for (const path of files)
    fingerprint
      .update(path)
      .update("\0")
      .update(source(path).replace(/\r\n/g, "\n"))
      .update("\0");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  console.log(`Branch: ${git("branch", "--show-current")}`);
  console.log(`HEAD: ${git("rev-parse", "--short", "HEAD")}`);
  console.log(`Expected Expo Go revision: ${revision}`);
  console.log(`Source fingerprint: ${fingerprint.digest("hex").slice(0, 16)}`);
  console.log(
    "Active routes point to the updated reviews and cancellation components.",
  );
  console.log(
    "Check Revisão mobile only at the internal development route /internal/diagnostics.",
  );
  console.log(
    "Offline source validation only; this does not verify the bundle running on the iPhone.",
  );
} catch {
  console.error(
    "Mobile source verification failed. Check project directory, patch files, routes and Git installation. No environment values were printed.",
  );
  process.exitCode = 1;
}
