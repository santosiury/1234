// Reconstructs the supplied geometric wordmark; never crops the reference board.
// Sharp is a development-only rasterizer. Inter comes from the licensed npm package.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "apps/mobile/assets/brand");
await mkdir(output, { recursive: true });
const point = (radius, angle) => {
  const a = (angle * Math.PI) / 180;
  return [74 + radius * Math.cos(a), 74 + radius * Math.sin(a)]
    .map((n) => n.toFixed(3))
    .join(" ");
};
const arc = (start, end) =>
  `M ${point(74, start)} A 74 74 0 0 1 ${point(74, end)} L ${point(41, end)} A 41 41 0 0 0 ${point(41, start)} Z`;
const symbol = `${arc(-40, 133)} ${arc(140, 313)}`;
const letters =
  "M 168 139 V 13 H 204 L 240 65 L 276 13 H 312 V 139 H 277 V 68 L 240 116 L 203 68 V 139 Z M 335 13 H 370 V 139 H 335 Z M 394 139 V 13 H 429 L 489 87 V 13 H 524 V 139 H 489 L 429 65 V 139 Z M 548 13 H 583 V 139 H 548 Z";
for (const [name, color] of [
  ["light", "#FFFFFF"],
  ["dark", "#101010"],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="583" height="148" viewBox="0 0 583 148"><title>Omini</title><path fill="${color}" d="${symbol} ${letters}"/></svg>\n`;
  await writeFile(path.join(output, `wordmark-${name}.svg`), svg);
  await sharp(Buffer.from(svg))
    .resize(1749, 444)
    .png()
    .toFile(path.join(output, `wordmark-${name}.png`));
}
const fontfile = path.join(
  root,
  "node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf",
);
const tagline = await sharp({
  text: {
    text: '<span foreground="#BDBDB6">Tudo resolvido. Sem dor de cabeça.</span>',
    font: "Inter Medium 92",
    fontfile,
    rgba: true,
  },
})
  .png()
  .toBuffer();
const taglineSize = await sharp(tagline).metadata();
await sharp({
  create: { width: 1749, height: 624, channels: 4, background: "#00000000" },
})
  .composite([
    { input: path.join(output, "wordmark-light.png"), top: 0, left: 0 },
    {
      input: tagline,
      top: 528,
      left: Math.round((1749 - taglineSize.width) / 2),
    },
  ])
  .png()
  .toFile(path.join(output, "splash-lockup.png"));
console.log(
  "Generated 2 SVG wordmarks, 2 transparent 3x PNGs and splash lockup (1749×624).",
);
