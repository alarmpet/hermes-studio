#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const desktopService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");

assert.match(
  workflow,
  /ELECTRON_RUN_AS_NODE/,
  "packaged Electron renders must run scripts with ELECTRON_RUN_AS_NODE=1 instead of starting Chromium",
);
assert.match(
  workflow,
  /resolveRenderNodeRunner/,
  "renderFinalYouTubeVideo should use an explicit runner resolver",
);
assert.match(
  desktopService,
  /nodeBin|renderRunner/,
  "desktop service should pass render runner information explicitly",
);
assert.doesNotMatch(
  workflow,
  /spawnSync\(process\.execPath,\s*\[scriptPath,\s*jobDir\]/,
  "renderFinalYouTubeVideo must not directly spawn process.execPath without Electron node-mode handling",
);
assert.doesNotMatch(
  workflow,
  /spawnSync\(runner\.command,\s*\[scriptPath,\s*jobDir\]/,
  "final render must not use spawnSync because it blocks the Electron main process",
);
assert.match(
  workflow,
  /spawn\(runner\.command,\s*\[scriptPath,\s*jobDir\]/,
  "final render should use asynchronous spawn so the UI event loop remains responsive",
);

console.log(JSON.stringify({ ok: true, checked: "packaged-render-runner" }));
