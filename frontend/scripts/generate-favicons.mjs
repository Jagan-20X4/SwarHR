/**
 * Crop black padding from source favicon and emit browser-sized variants.
 * Run: node scripts/generate-favicons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const source = path.join(publicDir, "favicon.png");

/** Bounding box of non-black, visible pixels (ignores outer letterbox). */
async function cropToContent(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 16) continue;
      // Skip near-black letterbox; keep colored logo + outlines
      if (r < 28 && g < 28 && b < 28) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return sharp(input).png().toBuffer();
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return sharp(input).extract({ left: minX, top: minY, width: w, height: h }).png().toBuffer();
}

async function main() {
  const backup = path.join(publicDir, "favicon.source.png");
  const inputPath = fs.existsSync(backup) ? backup : source;

  const cropped = await cropToContent(inputPath);
  const meta = await sharp(cropped).metadata();
  const side = Math.max(meta.width || 0, meta.height || 0);

  // Square, logo fills canvas for maximum tab visibility
  const base = await sharp(cropped)
    .resize(side, side, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const outputs = [
    ["favicon.png", 512],
    ["favicon-32.png", 32],
    ["favicon-16.png", 16],
    ["apple-touch-icon.png", 180],
  ];

  for (const [name, size] of outputs) {
    await sharp(base).resize(size, size).png().toFile(path.join(publicDir, name));
    console.log(`wrote ${name} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
