#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const styles = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");
const pathResolver = readFileSync(resolve(root, "electron/services/path-resolver.mjs"), "utf8");

assert.equal(packageJson.main, "electron/main.mjs", "Electron main entry should be configured");
assert.ok(packageJson.scripts["electron:dev"], "electron:dev script should exist");
assert.ok(packageJson.scripts["electron:pack"], "electron:pack script should exist");
assert.ok(packageJson.devDependencies.electron, "electron dev dependency should exist");
assert.ok(packageJson.devDependencies["electron-builder"], "electron-builder dev dependency should exist");

for (const file of [
  "electron/main.mjs",
  "electron/preload.mjs",
  "electron/renderer/index.html",
  "electron/renderer/app.js",
  "electron/renderer/styles.css",
]) {
  assert.ok(existsSync(resolve(root, file)), `${file} should exist`);
}

assert.match(main, /BrowserWindow/, "Main process should create a BrowserWindow");
assert.match(main, /ipcMain\.handle\("youtube:createJob"/, "Main process should handle YouTube job creation");
assert.match(main, /runYouTubeJob/, "Main process should call the shared YouTube runner");
assert.match(main, /normalizeYouTubeJobRequest/, "Main process should normalize desktop job requests");
assert.match(main, /getRuntimePaths/, "Main process should use centralized runtime paths");
assert.match(pathResolver, /app\.isPackaged/, "Path resolver should branch packaged runtime paths");
assert.match(pathResolver, /app\.getPath\("userData"\)/, "Packaged app should write outputs to userData");
assert.match(pathResolver, /process\.resourcesPath/, "Packaged app should read bundled scripts from resources");
assert.match(main, /app\.asar\.unpacked/, "Packaged app should execute unpacked binaries");
assert.match(main, /FFMPEG_BIN/, "Packaged render process should receive executable ffmpeg path");
assert.ok(packageJson.build.asarUnpack?.includes("scripts/**/*"), "Render scripts should be unpacked for external node execution");
assert.ok(packageJson.build.asarUnpack?.includes("node_modules/ffmpeg-static/**/*"), "ffmpeg-static should be unpacked for packaged execution");
assert.match(preload, /contextBridge/, "Preload should use contextBridge");
assert.match(preload, /youtubeCreateJob/, "Preload should expose youtubeCreateJob");
assert.match(preload, /onYouTubeEvent/, "Preload should expose YouTube event subscription");
assert.match(html, /Generate Final Video/, "Renderer should expose the generation action");
assert.match(html, /scriptLengthPreset/, "Renderer should expose script length selection");
assert.match(html, /voiceId/, "Renderer should expose voice selection");
assert.match(html, /subtitleStyleId/, "Renderer should expose subtitle style selection");
assert.match(renderer, /youtubeCreateJob/, "Renderer should submit jobs through IPC");
assert.match(renderer, /ChatGPT/, "Renderer should include ChatGPT thumbnail control");
assert.match(styles, /content-grid/, "Renderer styles should define the production layout");

console.log(JSON.stringify({ ok: true, checked: "electron-config" }));
