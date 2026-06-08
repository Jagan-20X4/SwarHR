import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rawPath = path.join(root, "src/legacy/rawApp.jsx");
const outPath = path.join(root, "src/legacy/LegacyApp.jsx");

const raw = fs.readFileSync(rawPath, "utf8");
const lines = raw.split(/\r?\n/);

const body = lines
  .slice(1) // drop `const { useState... } = React`
  .map((line) => (line.startsWith("    ") ? line.slice(4) : line))
  .join("\n");

const header = `import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

`;

const footer = `

export default App;
`;

const fixed = header + body.replace(/^function App/m, "export function App") + footer;

fs.writeFileSync(outPath, fixed, "utf8");
console.log("Wrote", outPath, `(${fixed.split("\n").length} lines)`);
