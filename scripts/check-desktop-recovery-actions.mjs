#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");

assert.match(html, /id="retryFailedScenesBtn"/, "Studio should expose a retry failed scenes button");
assert.match(html, /id="renderExistingAssetsBtn"/, "Studio should expose a render existing assets button");
assert.match(app, /selectedJobId/, "renderer should track the selected job id");
assert.match(app, /retryFailedScenesBtn/, "renderer should wire retry failed scenes button");
assert.match(app, /renderExistingAssetsBtn/, "renderer should wire render existing assets button");
assert.match(app, /youtubeRetryFailedScenes/, "renderer should invoke retry failed scenes IPC");
assert.match(app, /youtubeRenderExistingAssets/, "renderer should invoke render existing assets IPC");
assert.match(preload, /youtubeRetryFailedScenes/, "preload should expose retry failed scenes IPC");
assert.match(preload, /youtubeRenderExistingAssets/, "preload should expose render existing assets IPC");
assert.match(main, /ipcMain\.handle\("youtube:retryFailedScenes"/, "main should handle retry failed scenes");
assert.match(main, /ipcMain\.handle\("youtube:renderExistingAssets"/, "main should handle render existing assets");
assert.match(main, /readJobRequestFromJobDir/, "main recovery should load job-request.json from the selected output folder");
assert.match(main, /renderFinalYouTubeVideo/, "render existing assets should reuse final renderer");
assert.match(workflow, /scene-media-manifest\.json/, "workflow should persist scene media manifest for recovery");
assert.match(workflow, /findReusableSceneMedia/, "workflow should reuse completed scene media during recovery");

console.log(JSON.stringify({ ok: true, checked: "desktop-recovery-actions" }));
