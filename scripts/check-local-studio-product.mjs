#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pathResolver = readFileSync(resolve(root, "electron/services/path-resolver.mjs"), "utf8");
const configStore = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const authService = readFileSync(resolve(root, "electron/services/auth-service.mjs"), "utf8");
const browserProfileService = readFileSync(resolve(root, "electron/services/browser-profile-service.mjs"), "utf8");

assert.match(pathResolver, /getRuntimePaths/, "path resolver should export getRuntimePaths");
assert.match(pathResolver, /app\.getPath\("userData"\)/, "packaged app should use userData");
assert.match(pathResolver, /chatgpt-profile/, "should define ChatGPT profile path");
assert.match(pathResolver, /flow-profile/, "should define Google Flow profile path");
assert.match(pathResolver, /gemini-profile/, "should define Gemini profile path");
assert.match(pathResolver, /defaultTtsRoot/, "path resolver should expose a user-relative default TTS candidate");
assert.match(configStore, /loadConfig/, "config store should export loadConfig");
assert.match(configStore, /saveConfig/, "config store should export saveConfig");
assert.doesNotMatch(configStore, /C:\/Users\/amd\/supertonic3-local-tts-20260517-r4/, "config defaults must not hardcode the developer TTS path");
assert.match(main, /getRuntimePaths/, "main should use centralized path resolver");
assert.match(main, /config:get/, "main should expose config get IPC");
assert.match(main, /config:save/, "main should expose config save IPC");

for (const id of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
  assert.match(html, new RegExp(`auth-${id}`), `${id} auth button should exist`);
}
assert.match(preload, /authStart/, "preload should expose authStart");
assert.match(preload, /authStatus/, "preload should expose authStatus");
assert.match(renderer, /renderAuthStatus/, "renderer should render auth status");
assert.match(authService, /startAuth/, "auth service should export startAuth");
assert.match(authService, /getAuthStatus/, "auth service should export getAuthStatus");
assert.match(browserProfileService, /findChromeExecutable/, "browser profile service should discover Chrome paths");
assert.match(browserProfileService, /claimBrowserProfile/, "browser profile service should guard profile locks");
assert.doesNotMatch(authService, /C:\/Program Files\/Google\/Chrome\/Application\/chrome\.exe"\s*\}/, "auth service should not rely only on one Chrome path");

console.log(JSON.stringify({ ok: true, checked: "local-studio-product" }));
