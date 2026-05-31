#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagedAsar = resolve(root, "dist-electron/win-unpacked/resources/app.asar");
const unpackedRoot = resolve(root, "dist-electron/win-unpacked/resources/app.asar.unpacked");
const entryPath = resolve(unpackedRoot, "scripts/render-youtube-with-tts.mjs");

function extractImports(source) {
  const imports = [];
  const patterns = [
    /import\s+(?:[^{"']*\{[\s\S]*?\}|[\s\S]*?)\s+from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /import\((["'])([^"'\n]+)\1\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.push(match[2] || match[1]);
    }
  }

  return imports;
}

function isLocalImport(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function assertInsideUnpacked(path) {
  const relativePath = relative(unpackedRoot, path);
  assert.ok(
    relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath),
    `Render import escapes app.asar.unpacked: ${path}`,
  );
}

function resolveLocalImport(fromFile, specifier) {
  const base = specifier.startsWith("/")
    ? resolve(unpackedRoot, `.${specifier}`)
    : resolve(dirname(fromFile), specifier);
  const exactCandidates = extname(base)
    ? [base]
    : [`${base}.mjs`, `${base}.js`, resolve(base, "index.mjs"), resolve(base, "index.js"), base];
  const candidates = exactCandidates.filter((candidate) => {
    if (!existsSync(candidate)) return true;
    return statSync(candidate).isFile();
  });
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function verifyImportGraph(file, visited = new Set(), edges = []) {
  const resolvedFile = resolve(file);
  assertInsideUnpacked(resolvedFile);
  assert.ok(existsSync(resolvedFile), `Unpacked render dependency is missing: ${resolvedFile}`);

  if (visited.has(resolvedFile)) return { visited, edges };
  visited.add(resolvedFile);

  const source = readFileSync(resolvedFile, "utf8");
  for (const specifier of extractImports(source)) {
    if (!isLocalImport(specifier)) continue;
    const target = resolveLocalImport(resolvedFile, specifier);
    assertInsideUnpacked(target);
    edges.push({ from: resolvedFile, specifier, target });
    verifyImportGraph(target, visited, edges);
  }

  return { visited, edges };
}

if (!existsSync(packagedAsar)) {
  console.log(JSON.stringify({
    ok: true,
    checked: "packaged-render-import-graph",
    packaged: false,
    skipped: "dist-electron/win-unpacked/resources/app.asar does not exist",
  }));
  process.exit(0);
}

assert.ok(existsSync(unpackedRoot), `Packaged app exists but app.asar.unpacked is missing: ${unpackedRoot}`);
const result = verifyImportGraph(entryPath);

for (const required of [
  "electron/services/timeline-transition-renderer.mjs",
  "electron/services/render-effect-presets.mjs",
]) {
  const requiredPath = resolve(unpackedRoot, required);
  assert.ok(existsSync(requiredPath), `Required unpacked render service is missing: ${requiredPath}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: "packaged-render-import-graph",
  packaged: true,
  entryPath,
  files: result.visited.size,
  edges: result.edges.length,
}));
