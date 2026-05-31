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
const jobService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");

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
assert.match(main, /mainWindow\.maximize\(\)/, "Main app window should open maximized for stable browser workflows");
assert.match(main, /ipcMain\.handle\("youtube:createJob"/, "Main process should handle YouTube job creation");
assert.match(main, /createYouTubeJob/, "Main process should delegate YouTube jobs to the desktop job service");
assert.match(jobService, /runYouTubeJob/, "Desktop job service should call the shared YouTube runner");
assert.match(jobService, /normalizeYouTubeJobRequest/, "Desktop job service should normalize desktop job requests");
assert.match(main, /getRuntimePaths/, "Main process should use centralized runtime paths");
assert.match(pathResolver, /app\.isPackaged/, "Path resolver should branch packaged runtime paths");
assert.match(pathResolver, /app\.getPath\("userData"\)/, "Packaged app should write outputs to userData");
assert.match(pathResolver, /process\.resourcesPath/, "Packaged app should read bundled scripts from resources");
assert.match(main, /app\.asar\.unpacked/, "Packaged app should execute unpacked binaries");
assert.match(main, /FFMPEG_BIN/, "Packaged render process should receive executable ffmpeg path");
assert.ok(packageJson.build.asarUnpack?.includes("scripts/**/*"), "Render scripts should be unpacked for external node execution");
assert.ok(packageJson.build.asarUnpack?.includes("electron/services/**/*.mjs"), "Render service modules should be unpacked for external node ESM imports");
assert.ok(packageJson.build.asarUnpack?.includes("node_modules/ffmpeg-static/**/*"), "ffmpeg-static should be unpacked for packaged execution");
assert.ok(packageJson.build.asarUnpack?.includes("node_modules/@img/**/*"), "Sharp native @img packages should be unpacked for packaged execution");
assert.match(packageJson.scripts["check:packaged-render-runner"], /check-packaged-render-import-graph\.mjs/, "Packaged render checks should verify unpacked import graph");
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

const authService = readFileSync(resolve(root, "electron/services/auth-service.mjs"), "utf8");
const flowAutomation = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const geminiAutomation = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const urlLiveWorkflow = readFileSync(resolve(root, "scripts/run-url-ui-workflow-live.mjs"), "utf8");
const longformLiveWorkflow = readFileSync(resolve(root, "scripts/run-longform-history-ui-workflow.mjs"), "utf8");

assert.match(authService, /--start-maximized/, "Auth Chrome windows should start maximized");
assert.match(authService, /--window-size=1920,1080/, "Auth Chrome windows should use a large default size");
assert.match(authService, /--window-position=0,0/, "Auth Chrome windows should start at the primary display origin");
assert.match(flowAutomation, /viewport:\s*\{\s*width:\s*1920,\s*height:\s*1080\s*\}/, "Google Flow automation should use a large viewport");
assert.match(flowAutomation, /--start-maximized/, "Google Flow Chrome should start maximized");
assert.match(flowAutomation, /Browser\.setWindowBounds/, "Google Flow automation should maximize the actual Chrome window via CDP");
assert.match(flowAutomation, /windowState:\s*"maximized"/, "Google Flow automation should verify Chrome window maximized state");
assert.match(flowAutomation, /setViewportSize\(\{\s*width,\s*height\s*\}\)/, "Google Flow page should enforce a large viewport");
assert.match(flowAutomation, /ensureLargeViewport/, "Google Flow automation should verify the large viewport was actually applied");
assert.doesNotMatch(flowAutomation, /setViewportSize\([^\n]+\)\.catch/, "Google Flow automation should not ignore viewport failures");
assert.doesNotMatch(flowAutomation, /width:\s*1280,\s*height:\s*720/, "Google Flow automation should not fall back to a small viewport");
assert.match(geminiAutomation, /viewport:\s*\{\s*width:\s*1920,\s*height:\s*1080\s*\}/, "Gemini automation should use a large viewport");
assert.match(geminiAutomation, /--start-maximized/, "Gemini Chrome should start maximized");
assert.match(geminiAutomation, /Browser\.setWindowBounds/, "Gemini automation should maximize the actual Chrome window via CDP");
assert.match(geminiAutomation, /windowState:\s*"maximized"/, "Gemini automation should verify Chrome window maximized state");
assert.match(geminiAutomation, /ensureLargeViewport/, "Gemini automation should verify the large viewport was actually applied");
assert.doesNotMatch(geminiAutomation, /setViewportSize\([^\n]+\)\.catch/, "Gemini automation should not ignore viewport failures");
assert.match(urlLiveWorkflow, /BrowserWindow[\s\S]*maximize\(\)/, "URL live workflow should maximize the Electron app before clicking");
assert.match(urlLiveWorkflow, /appWindowBounds/, "URL live workflow should record maximized window bounds");
assert.match(urlLiveWorkflow, /appViewport/, "URL live workflow should record the enforced viewport");
assert.match(longformLiveWorkflow, /BrowserWindow[\s\S]*maximize\(\)/, "Longform live workflow should maximize the Electron app before clicking");
assert.match(longformLiveWorkflow, /appWindowBounds/, "Longform live workflow should record maximized window bounds");
assert.match(longformLiveWorkflow, /appViewport/, "Longform live workflow should record the enforced viewport");

console.log(JSON.stringify({ ok: true, checked: "electron-config" }));
