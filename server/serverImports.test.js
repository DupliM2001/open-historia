// Run: node --test server/serverImports.test.js
//
// The desktop app packages dist/ (the built client) and server/ — never src/
// (package.json "build.files"). A server-side import of ../src/… loads in
// development, where the whole tree is on disk, and fails in the installed
// app: "Cannot find module …/app.asar/src/runtime/coarseGeometry.js imported
// from …/app.asar/server/libraryStore.js" took the beta down at startup.
// Code both sides use lives under server/ and the client imports it from
// there (ownerMigration.js, coarseGeometry.js).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packaged = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).build.files;

const serverModules = fs.readdirSync(here)
  .filter((name) => /\.(js|cjs|mjs)$/.test(name) && !/\.test\./.test(name))
  .map((name) => path.join(here, name));

const importsOf = (file) => {
  const text = fs.readFileSync(file, "utf-8");
  const out = [];
  for (const match of text.matchAll(/(?:^|\n)\s*(?:import\b[^;]*?from\s*|export\b[^;]*?from\s*|import\s*\(\s*)["']([^"']+)["']/g)) out.push(match[1]);
  return out;
};

test("the desktop package ships server/ but not src/", () => {
  assert.ok(packaged.includes("server/**"), "server/** is packaged");
  assert.ok(!packaged.some((entry) => /^src\b/.test(entry)), "src/ is not packaged — the client ships built, in dist/");
});

test("no server module imports from src/, which the installed app does not carry", () => {
  const offenders = [];
  for (const file of serverModules) {
    for (const specifier of importsOf(file)) {
      if (/^(\.\.\/)+src\//.test(specifier)) offenders.push(`${path.basename(file)} -> ${specifier}`);
    }
  }
  assert.deepEqual(offenders, [], "move the module under server/ and import it from there on both sides");
});

test("every relative import inside server/ resolves to a file that exists", () => {
  const missing = [];
  for (const file of serverModules) {
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith(".")) continue;
      const target = path.resolve(path.dirname(file), specifier);
      if (!fs.existsSync(target)) missing.push(`${path.basename(file)} -> ${specifier}`);
    }
  }
  assert.deepEqual(missing, []);
});
