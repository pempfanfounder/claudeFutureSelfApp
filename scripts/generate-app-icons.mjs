#!/usr/bin/env node
/**
 * Generates one iOS app icon per theme: the theme's background colour as
 * a full-bleed 1024×1024 canvas with the brand mark (the cream "fs" tile
 * from the Android adaptive-icon foreground) inset and centred.
 *
 * Output: assets/icons/icon-<themeId>.png — opaque PNGs (iOS rejects
 * alpha in app icons), consumed by the expo-alternate-app-icons plugin
 * (app.json) and bundled for the in-app pickers (src/design-system/appIcons.ts).
 *
 * Usage: node scripts/generate-app-icons.mjs
 * (needs the `sharp` devDependency; re-run whenever THEMES gains an id or
 * a theme's `bg` changes, then commit the PNGs).
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_FILE = join(ROOT, "src/design-system/themes.ts");
const FOREGROUND = join(ROOT, "assets/images/android-icon-foreground.png");
const OUT_DIR = join(ROOT, "assets/icons");

/** iOS app icon export size. */
const SIZE = 1024;
/** The brand tile's share of the icon width. */
const TILE_RATIO = 0.72;
/** Corner radius of the brand tile relative to its width. */
const TILE_CORNER_RATIO = 0.22;

/**
 * Reads `id`/`bg` pairs straight from the THEMES source text so the
 * script has no TypeScript toolchain dependency. Matches each object
 * literal's `id: "…"` followed (before the next `id:`) by `bg: "#……"`.
 */
async function readThemes() {
  const source = await readFile(THEMES_FILE, "utf8");
  const themesBlock = source.slice(source.indexOf("export const THEMES"));
  const pattern =
    /id:\s*["'`]([a-z0-9_]+)["'`][\s\S]*?\bbg:\s*["'`](#[0-9a-fA-F]{6})["'`]/g;
  const themes = [];
  const seen = new Set();
  for (const match of themesBlock.matchAll(pattern)) {
    const [, id, bg] = match;
    if (seen.has(id)) continue; // palette blocks repeat `bg`, never `id`
    seen.add(id);
    themes.push({ id, bg: bg.toUpperCase() });
  }
  if (themes.length === 0) {
    throw new Error(`No themes parsed from ${THEMES_FILE}`);
  }
  return themes;
}

/**
 * Crops the foreground asset to its opaque content (the cream tile sits
 * inside Android's transparent safe-zone padding) so the tile — not the
 * padding — is what gets scaled to TILE_RATIO.
 */
async function loadBrandTile() {
  const { data, info } = await sharp(FOREGROUND)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${FOREGROUND} is fully transparent`);
  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const tileSize = Math.round(SIZE * TILE_RATIO);
  const radius = Math.round(tileSize * TILE_CORNER_RATIO);
  const mask = Buffer.from(
    `<svg width="${tileSize}" height="${tileSize}"><rect x="0" y="0" width="${tileSize}" height="${tileSize}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  const tile = await sharp(FOREGROUND)
    .extract({ left: minX, top: minY, width: side, height: side })
    .resize(tileSize, tileSize, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return { tile, tileSize };
}

async function main() {
  const themes = await readThemes();
  const { tile, tileSize } = await loadBrandTile();
  await mkdir(OUT_DIR, { recursive: true });
  const offset = Math.round((SIZE - tileSize) / 2);

  for (const { id, bg } of themes) {
    const out = join(OUT_DIR, `icon-${id}.png`);
    await sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: bg },
    })
      .composite([{ input: tile, left: offset, top: offset }])
      .flatten({ background: bg })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`wrote ${out} (${bg})`);
  }
  console.log(`${themes.length} icons written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
