/**
 * Extracts the inline Babel/React app from frontend/index.html for migration.
 *
 * Usage (from frontend/):
 *   node scripts/extract-legacy.mjs
 *
 * Outputs:
 *   src/legacy/rawApp.jsx       — script body (lines 135–5105, excludes ReactDOM.createRoot)
 *   src/legacy/components.json  — PascalCase function components + line ranges in index.html
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(FRONTEND_ROOT, "index.html");
const LEGACY_DIR = path.join(FRONTEND_ROOT, "src", "legacy");
const RAW_OUT = path.join(LEGACY_DIR, "rawApp.jsx");
const MANIFEST_OUT = path.join(LEGACY_DIR, "components.json");

/** 1-based inclusive line range inside index.html <script type="text/babel"> */
const START_LINE = 135;
const END_LINE = 5105;

/** Top-level `function Foo(` / `function App(` inside the babel block (4-space indent). */
const COMPONENT_RE = /^    function ((?:[A-Z][A-Za-z0-9_]*|App))\s*\(/;

function readIndexLines() {
  if (!fs.existsSync(INDEX_HTML)) {
    throw new Error(`index.html not found: ${INDEX_HTML}`);
  }
  const text = fs.readFileSync(INDEX_HTML, "utf8");
  return text.split(/\r?\n/);
}

function extractBody(lines) {
  if (lines.length < END_LINE) {
    throw new Error(
      `index.html has ${lines.length} lines; expected at least ${END_LINE}`
    );
  }
  return lines.slice(START_LINE - 1, END_LINE);
}

function findComponents(lines) {
  const components = [];
  for (let i = START_LINE - 1; i < END_LINE; i++) {
    const match = lines[i].match(COMPONENT_RE);
    if (match) {
      components.push({
        name: match[1],
        startLine: i + 1,
      });
    }
  }
  for (let j = 0; j < components.length; j++) {
    const endLine =
      j + 1 < components.length
        ? components[j + 1].startLine - 1
        : END_LINE;
    components[j].endLine = endLine;
    components[j].lineCount = endLine - components[j].startLine + 1;
  }
  return components;
}

function main() {
  const lines = readIndexLines();
  const bodyLines = extractBody(lines);
  const body = bodyLines.join("\n") + "\n";

  fs.mkdirSync(LEGACY_DIR, { recursive: true });
  fs.writeFileSync(RAW_OUT, body, "utf8");

  const components = findComponents(lines);
  const manifest = {
    source: "frontend/index.html",
    babelScript: { startLine: START_LINE, endLine: END_LINE },
    excluded: "ReactDOM.createRoot (line 5107+)",
    outputFile: "src/legacy/rawApp.jsx",
    componentCount: components.length,
    components,
  };
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Wrote ${path.relative(FRONTEND_ROOT, RAW_OUT)} (${bodyLines.length} lines)`);
  console.log(`Wrote ${path.relative(FRONTEND_ROOT, MANIFEST_OUT)}`);
  console.log(`\nFunction components (${components.length}):\n`);
  console.log(
    "Name".padEnd(28) +
      "Start".padStart(7) +
      "End".padStart(7) +
      "Lines".padStart(7)
  );
  console.log("-".repeat(49));
  for (const c of components) {
    console.log(
      c.name.padEnd(28) +
        String(c.startLine).padStart(7) +
        String(c.endLine).padStart(7) +
        String(c.lineCount).padStart(7)
    );
  }
}

main();
