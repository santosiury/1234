import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
const base = new URL("../apps/mobile/", import.meta.url);
for (const name of ["light", "dark"]) {
  const png = new URL(`assets/brand/wordmark-${name}.png`, base);
  const svg = await readFile(
    new URL(`assets/brand/wordmark-${name}.svg`, base),
    "utf8",
  );
  const metadata = await sharp(png.pathname).metadata();
  assert.equal(metadata.width, 1749);
  assert.equal(metadata.height, 444);
  assert.equal(metadata.hasAlpha, true);
  assert.ok(svg.includes('viewBox="0 0 583 148"'));
  assert.ok(
    !svg.includes("<text"),
    "Wordmark must be vector outlines, independent of device fonts",
  );
}
const splash = await sharp(
  new URL("assets/brand/splash-lockup.png", base).pathname,
).metadata();
assert.equal(splash.width, 1749);
assert.equal(splash.height, 624);
assert.equal(splash.hasAlpha, true);
const config = JSON.parse(
  await readFile(new URL("app.json", base), "utf8"),
).expo;
const plugin = config.plugins.find(
  (p) => Array.isArray(p) && p[0] === "expo-splash-screen",
)[1];
assert.equal(plugin.resizeMode, "contain");
assert.equal(plugin.backgroundColor, config.backgroundColor);
assert.ok(plugin.imageWidth <= 280, "Splash must fit small iPhones");
assert.equal(
  plugin.android.imageWidth,
  180,
  "Keep complete lockup inside Android 12's circular splash safe zone",
);
await sharp(new URL(plugin.image, base).pathname).metadata();
console.log(
  "Brand assets OK: vector outlines, transparent 3x PNGs, lockup, iOS/Android launch configuration.",
);
