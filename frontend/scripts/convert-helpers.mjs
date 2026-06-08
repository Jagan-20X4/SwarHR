import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src/legacy/helpers.js"), "utf8");

let out = "// @ts-nocheck\n/* Auto-generated from helpers.js — migrate symbols to @/domain and @/shared over time */\n\n";
out += src
  .replace(/^async function /gm, "export async function ")
  .replace(/^function /gm, "export function ")
  .replace(/^const /gm, "export const ");

fs.writeFileSync(path.join(root, "src/legacy/helpersModule.ts"), out, "utf8");
console.log("Wrote helpersModule.ts");
