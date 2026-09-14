#!/usr/bin/env node
/**
 * Generates one iOS app icon per offered theme: the Future Self mark
 * (the dark "fs" letters from the primary icon) full-bleed on that
 * theme's fill — no inset cream tile, no extra border colour.
 *
 * For each id: `icon-<id>.png` (Light), `icon-<id>-dark.png` (Dark),
 * `icon-<id>-tinted.png` (Tinted). Opaque PNGs; iOS rejects alpha.
 *
 * Soft Bloom and Inkwell are not generated. Sun is a seasonal fill in THEMES.
 *
 * Usage: node scripts/generate-app-icons.mjs
 */
import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_FILE = join(ROOT, "src/design-system/themes.ts");
const SOURCE = join(ROOT, "assets/images/icon.png");
const OUT_DIR = join(ROOT, "assets/icons");

/** Matches the in-app picker order in src/design-system/appIcons.ts. */
const ICON_IDS = [
  "minimal_sand",
  "ocean_clarity",
  "terracotta",
  "midnight_focus",
  "arctic",
  "sun",
  "sunrise_momentum",
  "golden_success",
  "evergreen",
];

const SIZE = 1024;
/** Cream of the primary icon; letters sit well below this. */
const CREAM_LUM = 220;
/** Dark of the "fs" letters. */
const INK_LUM = 50;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toGrayHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  const y = Math.round(luminance(r, g, b));
  const h = y.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`.toUpperCase();
}

/**
 * Reads `id` / `category` / `bg` / `ink` from THEMES so the script has
 * no TypeScript toolchain dependency.
 */
async function readThemes() {
  const source = await readFile(THEMES_FILE, "utf8");
  const themesBlock = source.slice(source.indexOf("export const THEMES"));
  const pattern =
    /id:\s*["'`]([a-z0-9_]+)["'`][\s\S]*?\bcategory:\s*["'`](light|dark|seasonal)["'`][\s\S]*?\bbg:\s*["'`](#[0-9a-fA-F]{6})["'`][\s\S]*?\bink:\s*["'`](#[0-9a-fA-F]{6})["'`]/g;
  const themes = new Map();
  for (const match of themesBlock.matchAll(pattern)) {
    const [, id, category, bg, ink] = match;
    if (themes.has(id)) continue;
    themes.set(id, {
      id,
      category,
      bg: bg.toUpperCase(),
      ink: ink.toUpperCase(),
    });
  }
  if (themes.size === 0) {
    throw new Error(`No themes parsed from ${THEMES_FILE}`);
  }
  return themes;
}

/**
 * Per-pixel coverage of the "fs" letters, taken from the primary icon
 * so every alternate is the same mark, full-bleed, on a new fill.
 */
async function loadMarkAlpha() {
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== SIZE || info.height !== SIZE) {
    throw new Error(
      `${SOURCE} must be ${SIZE}×${SIZE} (got ${info.width}×${info.height})`,
    );
  }
  const alpha = new Float32Array(SIZE * SIZE);
  for (let p = 0, i = 0; p < alpha.length; p++, i += info.channels) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    const srcA = info.channels > 3 ? data[i + 3] / 255 : 1;
    let t = (CREAM_LUM - lum) / (CREAM_LUM - INK_LUM);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    alpha[p] = t * srcA;
  }
  return alpha;
}

async function paintIcon(bgHex, inkHex, alpha) {
  const bg = hexToRgb(bgHex);
  const ink = hexToRgb(inkHex);
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let p = 0; p < alpha.length; p++) {
    const a = alpha[p];
    const i = p * 3;
    buf[i] = Math.round(bg.r + (ink.r - bg.r) * a);
    buf[i + 1] = Math.round(bg.g + (ink.g - bg.g) * a);
    buf[i + 2] = Math.round(bg.b + (ink.b - bg.b) * a);
  }
  return sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function flattenPrimary() {
  return sharp(SOURCE)
    .flatten({ background: "#F5EDE0" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function writePng(path, buffer) {
  await sharp(buffer).removeAlpha().png({ compressionLevel: 9 }).toFile(path);
}

async function main() {
  const themes = await readThemes();
  const alpha = await loadMarkAlpha();
  await mkdir(OUT_DIR, { recursive: true });

  for (const id of ICON_IDS) {
    const theme = themes.get(id);
    if (!theme) throw new Error(`Theme "${id}" missing from ${THEMES_FILE}`);

    const lightBuf =
      id === "minimal_sand"
        ? await flattenPrimary()
        : await paintIcon(theme.bg, theme.ink, alpha);
    const darkBuf =
      theme.category === "dark"
        ? await paintIcon(theme.bg, theme.ink, alpha)
        : await paintIcon(theme.ink, theme.bg, alpha);
    const tintedBuf = await paintIcon(
      toGrayHex(theme.bg),
      toGrayHex(theme.ink),
      alpha,
    );

    const lightPath = join(OUT_DIR, `icon-${id}.png`);
    const darkPath = join(OUT_DIR, `icon-${id}-dark.png`);
    const tintedPath = join(OUT_DIR, `icon-${id}-tinted.png`);
    await writePng(lightPath, lightBuf);
    await writePng(darkPath, darkBuf);
    await writePng(tintedPath, tintedBuf);
    console.log(`wrote ${id} (${theme.bg} / ${theme.ink})`);
  }

  // Soft Bloom and Inkwell stay out of the picker; drop leftover files.
  for (const id of ["soft_bloom", "ink_well"]) {
    for (const suffix of ["", "-dark", "-tinted"]) {
      const retired = join(OUT_DIR, `icon-${id}${suffix}.png`);
      try {
        await unlink(retired);
        console.log(`removed ${retired}`);
      } catch (error) {
        if (error && error.code !== "ENOENT") throw error;
      }
    }
  }

  console.log(`${ICON_IDS.length} icons × light/dark/tinted → ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
